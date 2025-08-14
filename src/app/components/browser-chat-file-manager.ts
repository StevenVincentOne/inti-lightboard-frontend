// Browser-Compatible Local Chat File Manager for TensorDock
// Stores text chat in localStorage by topic UUID, exports to remote storage every 500 tokens

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens: number;
  metadata?: Record<string, any>;
}

export interface TopicChatFile {
  topicUuid: string;
  title?: string;
  messages: ChatMessage[];
  totalTokens: number;
  lastExportedIndex: number;
  lastExportedTokens: number;
  createdAt: number;
  updatedAt: number;
  exported: boolean;
}

export interface ExportBatch {
  topicUuid: string;
  messages: ChatMessage[];
  startIndex: number;
  endIndex: number;
  tokenCount: number;
  timestamp: number;
}

export class BrowserChatFileManager {
  private chatStorageKey: string;
  private tokenThreshold: number;
  private userId: number;

  constructor(userId: number, tokenThreshold: number = 500) {
    this.userId = userId;
    this.chatStorageKey = `chat-storage-user-${userId}`;
    this.tokenThreshold = tokenThreshold;
  }

  private getTopicStorageKey(topicUuid: string): string {
    return `${this.chatStorageKey}-topic-${topicUuid}`;
  }

  // Load existing chat file for a topic from localStorage
  async loadTopicChat(topicUuid: string): Promise<TopicChatFile | null> {
    try {
      const storageKey = this.getTopicStorageKey(topicUuid);
      const fileContent = localStorage.getItem(storageKey);
      
      if (!fileContent) {
        console.log(`No existing chat file for topic ${topicUuid}`);
        return null;
      }

      const chatFile: TopicChatFile = JSON.parse(fileContent);
      console.log(`Loaded topic ${topicUuid}: ${chatFile.messages.length} messages, ${chatFile.totalTokens} tokens`);
      return chatFile;
    } catch (error) {
      console.error(`Failed to load topic chat ${topicUuid}:`, error);
      return null;
    }
  }

  // Create new chat file for a topic
  async createTopicChat(topicUuid: string, title?: string): Promise<TopicChatFile> {
    const chatFile: TopicChatFile = {
      topicUuid,
      title,
      messages: [],
      totalTokens: 0,
      lastExportedIndex: 0,
      lastExportedTokens: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exported: false
    };

    await this.saveTopicChat(chatFile);
    console.log(`Created new chat file for topic ${topicUuid}`);
    return chatFile;
  }

  // Save chat file to localStorage
  private async saveTopicChat(chatFile: TopicChatFile): Promise<void> {
    try {
      chatFile.updatedAt = Date.now();
      const storageKey = this.getTopicStorageKey(chatFile.topicUuid);
      localStorage.setItem(storageKey, JSON.stringify(chatFile));
    } catch (error) {
      console.error(`Failed to save topic chat ${chatFile.topicUuid}:`, error);
      throw error;
    }
  }

  // Add message to topic chat file
  async addMessage(
    topicUuid: string, 
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): Promise<{chatFile: TopicChatFile, shouldExport: boolean, exportBatch?: ExportBatch}> {
    
    // Load or create chat file
    let chatFile = await this.loadTopicChat(topicUuid);
    if (!chatFile) {
      chatFile = await this.createTopicChat(topicUuid);
    }

    // Create new message
    const tokens = this.estimateTokens(content);
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      tokens,
      metadata
    };

    // Add message to file
    chatFile.messages.push(message);
    chatFile.totalTokens += tokens;

    // Save to localStorage
    await this.saveTopicChat(chatFile);

    // Check if we need to export
    const tokensSinceLastExport = chatFile.totalTokens - chatFile.lastExportedTokens;
    const shouldExport = tokensSinceLastExport >= this.tokenThreshold;

    let exportBatch: ExportBatch | undefined;
    if (shouldExport) {
      exportBatch = this.createExportBatch(chatFile);
    }

    console.log(`Added message to ${topicUuid}: ${content.substring(0, 50)}... (${tokens} tokens)`);
    if (shouldExport) {
      console.log(`🔄 Export triggered: ${tokensSinceLastExport} tokens since last export`);
    }

    return { chatFile, shouldExport, exportBatch };
  }

  // Create export batch from messages since last export
  private createExportBatch(chatFile: TopicChatFile): ExportBatch {
    const startIndex = chatFile.lastExportedIndex;
    const endIndex = chatFile.messages.length;
    const messagesToExport = chatFile.messages.slice(startIndex);
    const tokenCount = messagesToExport.reduce((sum, msg) => sum + msg.tokens, 0);

    return {
      topicUuid: chatFile.topicUuid,
      messages: messagesToExport,
      startIndex,
      endIndex,
      tokenCount,
      timestamp: Date.now()
    };
  }

  // Mark messages as exported (update tracking)
  async markAsExported(topicUuid: string, exportBatch: ExportBatch): Promise<void> {
    const chatFile = await this.loadTopicChat(topicUuid);
    if (!chatFile) {
      throw new Error(`Chat file not found for topic ${topicUuid}`);
    }

    chatFile.lastExportedIndex = exportBatch.endIndex;
    chatFile.lastExportedTokens = chatFile.totalTokens;
    chatFile.exported = true;

    await this.saveTopicChat(chatFile);
    console.log(`✅ Marked ${exportBatch.messages.length} messages as exported for ${topicUuid}`);
  }

  // User-triggered "Save to Memory" - force export of current state
  async saveToMemory(topicUuid: string, forceExport: boolean = true): Promise<ExportBatch | null> {
    const chatFile = await this.loadTopicChat(topicUuid);
    if (!chatFile) {
      console.log(`No chat file found for topic ${topicUuid}`);
      return null;
    }

    if (forceExport || (chatFile.totalTokens - chatFile.lastExportedTokens) > 0) {
      const exportBatch = this.createExportBatch(chatFile);
      console.log(`💾 User triggered "Save to Memory" for ${topicUuid}: ${exportBatch.tokenCount} tokens`);
      return exportBatch;
    }

    console.log(`No new content to export for ${topicUuid}`);
    return null;
  }

  // Get chat history for topic resumption
  async getChatHistory(topicUuid: string, limit?: number): Promise<ChatMessage[]> {
    const chatFile = await this.loadTopicChat(topicUuid);
    if (!chatFile) {
      return [];
    }

    if (limit) {
      return chatFile.messages.slice(-limit);
    }

    return chatFile.messages;
  }

  // List all topics for user
  async listTopics(): Promise<{topicUuid: string, title?: string, messageCount: number, totalTokens: number, lastUpdated: number}[]> {
    try {
      const topics = [];
      const prefix = `${this.chatStorageKey}-topic-`;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const topicUuid = key.replace(prefix, '');
          const chatFile = await this.loadTopicChat(topicUuid);
          
          if (chatFile) {
            topics.push({
              topicUuid,
              title: chatFile.title,
              messageCount: chatFile.messages.length,
              totalTokens: chatFile.totalTokens,
              lastUpdated: chatFile.updatedAt
            });
          }
        }
      }

      return topics.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error) {
      console.error('Failed to list topics:', error);
      return [];
    }
  }

  // Get export status for all topics
  async getExportStatus(): Promise<{
    topicUuid: string, 
    totalTokens: number, 
    exportedTokens: number, 
    pendingTokens: number,
    lastExported: number
  }[]> {
    const topics = await this.listTopics();
    
    return Promise.all(
      topics.map(async (topic) => {
        const chatFile = await this.loadTopicChat(topic.topicUuid);
        const pendingTokens = chatFile ? (chatFile.totalTokens - chatFile.lastExportedTokens) : 0;
        
        return {
          topicUuid: topic.topicUuid,
          totalTokens: topic.totalTokens,
          exportedTokens: chatFile?.lastExportedTokens || 0,
          pendingTokens,
          lastExported: chatFile?.updatedAt || 0
        };
      })
    );
  }

  // Get storage statistics
  async getStorageStats(): Promise<{
    totalTopics: number,
    totalMessages: number,
    totalTokens: number,
    storageSize: number,
    pendingExports: number
  }> {
    const topics = await this.listTopics();
    const exportStatus = await this.getExportStatus();
    
    const totalMessages = topics.reduce((sum, topic) => sum + topic.messageCount, 0);
    const totalTokens = topics.reduce((sum, topic) => sum + topic.totalTokens, 0);
    const pendingExports = exportStatus.filter(status => status.pendingTokens > 0).length;

    // Calculate storage size (approximate)
    let storageSize = 0;
    const prefix = `${this.chatStorageKey}-topic-`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        if (value) {
          storageSize += value.length;
        }
      }
    }

    return {
      totalTopics: topics.length,
      totalMessages,
      totalTokens,
      storageSize,
      pendingExports
    };
  }

  // Estimate tokens from text (simple approximation)
  private estimateTokens(text: string): number {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

export default BrowserChatFileManager;