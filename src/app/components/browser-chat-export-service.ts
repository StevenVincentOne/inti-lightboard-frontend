// Browser Chat Export Service - Sends local chat batches to PostgreSQL and Neo4j
// Handles 500-token exports and user-triggered "Save to Memory" actions

import BrowserChatFileManager, { ExportBatch, ChatMessage } from './browser-chat-file-manager';

export interface ExportDestination {
  name: string;
  enabled: boolean;
  endpoint: string;
  headers?: Record<string, string>;
}

export interface ExportResult {
  destination: string;
  success: boolean;
  messageCount: number;
  tokenCount: number;
  error?: string;
  timestamp: number;
}

export interface ExportConfig {
  destinations: {
    postgresql: ExportDestination;
    neo4j: ExportDestination;
  };
  retryAttempts: number;
  retryDelayMs: number;
  batchTimeout: number;
}

export class BrowserChatExportService {
  private fileManager: BrowserChatFileManager;
  private config: ExportConfig;
  private exportQueue: ExportBatch[] = [];
  private isExporting: boolean = false;

  constructor(userId: number, config?: Partial<ExportConfig>) {
    this.fileManager = new BrowserChatFileManager(userId);
    this.config = {
      destinations: {
        postgresql: {
          name: 'PostgreSQL',
          enabled: true,
          endpoint: '/api/chat/export/postgresql',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAuthToken()}`
          }
        },
        neo4j: {
          name: 'Neo4j',
          enabled: false, // Enable when Neo4j integration is ready
          endpoint: '/api/chat/export/neo4j',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAuthToken()}`
          }
        }
      },
      retryAttempts: 3,
      retryDelayMs: 1000,
      batchTimeout: 30000,
      ...config
    };
  }

  // Main method: Add message and handle automatic export
  async addMessageWithExport(
    topicUuid: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ): Promise<{success: boolean, exportResults?: ExportResult[]}> {
    try {
      // Add message to local storage
      const result = await this.fileManager.addMessage(topicUuid, role, content, metadata);
      
      // If export threshold reached, queue for export
      if (result.shouldExport && result.exportBatch) {
        const exportResults = await this.exportBatch(result.exportBatch);
        
        // Mark as exported if successful
        if (exportResults.some(r => r.success)) {
          await this.fileManager.markAsExported(topicUuid, result.exportBatch);
        }
        
        return { success: true, exportResults };
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to add message with export:', error);
      return { success: false };
    }
  }

  // User-triggered "Save to Memory" export
  async saveToMemory(topicUuid: string): Promise<{success: boolean, exportResults?: ExportResult[]}> {
    try {
      console.log(`💾 User triggered "Save to Memory" for topic ${topicUuid}`);
      
      const exportBatch = await this.fileManager.saveToMemory(topicUuid, true);
      if (!exportBatch) {
        console.log('No new content to export');
        return { success: true };
      }

      const exportResults = await this.exportBatch(exportBatch);
      
      // Mark as exported if successful
      if (exportResults.some(r => r.success)) {
        await this.fileManager.markAsExported(topicUuid, exportBatch);
      }

      // Show user feedback
      this.showExportNotification(exportResults);
      
      return { success: true, exportResults };
    } catch (error) {
      console.error('Save to memory failed:', error);
      return { success: false };
    }
  }

  // Export batch to all enabled destinations
  private async exportBatch(batch: ExportBatch): Promise<ExportResult[]> {
    console.log(`🔄 Exporting batch: ${batch.messages.length} messages, ${batch.tokenCount} tokens`);
    
    const results: ExportResult[] = [];
    
    // Export to PostgreSQL
    if (this.config.destinations.postgresql.enabled) {
      const result = await this.exportToPostgreSQL(batch);
      results.push(result);
    }

    // Export to Neo4j
    if (this.config.destinations.neo4j.enabled) {
      const result = await this.exportToNeo4j(batch);
      results.push(result);
    }

    console.log(`Export completed: ${results.filter(r => r.success).length}/${results.length} destinations successful`);
    return results;
  }

  // Export to PostgreSQL database
  private async exportToPostgreSQL(batch: ExportBatch): Promise<ExportResult> {
    const destination = this.config.destinations.postgresql;

    try {
      const payload = {
        topicUuid: batch.topicUuid,
        messages: batch.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          tokens: msg.tokens,
          metadata: msg.metadata
        })),
        batchInfo: {
          startIndex: batch.startIndex,
          endIndex: batch.endIndex,
          tokenCount: batch.tokenCount,
          exportTimestamp: batch.timestamp
        }
      };

      const response = await fetch(destination.endpoint, {
        method: 'POST',
        headers: destination.headers || {},
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`PostgreSQL export failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log(`✅ PostgreSQL export successful:`, responseData);

      return {
        destination: 'PostgreSQL',
        success: true,
        messageCount: batch.messages.length,
        tokenCount: batch.tokenCount,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('PostgreSQL export failed:', error);
      return {
        destination: 'PostgreSQL',
        success: false,
        messageCount: batch.messages.length,
        tokenCount: batch.tokenCount,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  // Export to Neo4j (placeholder for future implementation)
  private async exportToNeo4j(batch: ExportBatch): Promise<ExportResult> {
    const destination = this.config.destinations.neo4j;

    try {
      // Convert chat messages to Neo4j format
      const nodes = batch.messages.map(msg => ({
        type: 'ChatMessage',
        properties: {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          tokens: msg.tokens,
          topicUuid: batch.topicUuid
        }
      }));

      const relationships = batch.messages.slice(1).map((msg, index) => ({
        type: 'FOLLOWS',
        from: batch.messages[index].id,
        to: msg.id,
        properties: {
          conversationFlow: true
        }
      }));

      const payload = {
        topicUuid: batch.topicUuid,
        nodes,
        relationships,
        batchInfo: {
          tokenCount: batch.tokenCount,
          exportTimestamp: batch.timestamp
        }
      };

      const response = await fetch(destination.endpoint, {
        method: 'POST',
        headers: destination.headers || {},
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Neo4j export failed: ${response.status} ${response.statusText}`);
      }

      console.log(`✅ Neo4j export successful`);

      return {
        destination: 'Neo4j',
        success: true,
        messageCount: batch.messages.length,
        tokenCount: batch.tokenCount,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Neo4j export failed:', error);
      return {
        destination: 'Neo4j',
        success: false,
        messageCount: batch.messages.length,
        tokenCount: batch.tokenCount,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  // Load chat history for topic resumption
  async loadChatHistory(topicUuid: string, limit?: number): Promise<ChatMessage[]> {
    return await this.fileManager.getChatHistory(topicUuid, limit);
  }

  // Get export status for dashboard
  async getExportStatus() {
    return await this.fileManager.getExportStatus();
  }

  // Get storage statistics
  async getStorageStats() {
    return await this.fileManager.getStorageStats();
  }

  // Show user notification for export results
  private showExportNotification(results: ExportResult[]): void {
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    if (successCount === totalCount) {
      this.showToast(`✅ Saved to memory: ${results[0].messageCount} messages exported`, 'success');
    } else if (successCount > 0) {
      this.showToast(`⚠️ Partially saved: ${successCount}/${totalCount} destinations successful`, 'warning');
    } else {
      this.showToast(`❌ Save failed: Unable to export to any destination`, 'error');
    }
  }

  // Simple toast notification system
  private showToast(message: string, type: 'success' | 'warning' | 'error'): void {
    // Create toast element
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      z-index: 10000;
      transition: opacity 0.3s;
      ${type === 'success' ? 'background: #10b981;' : ''}
      ${type === 'warning' ? 'background: #f59e0b;' : ''}
      ${type === 'error' ? 'background: #ef4444;' : ''}
    `;

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // Bulk export all pending topics
  async exportAllPending(): Promise<{topicUuid: string, success: boolean, results?: ExportResult[]}[]> {
    console.log('🔄 Starting bulk export of all pending topics...');
    
    const exportStatus = await this.getExportStatus();
    const pendingTopics = exportStatus.filter(status => status.pendingTokens > 0);
    
    const results = [];
    
    for (const status of pendingTopics) {
      try {
        const exportBatch = await this.fileManager.saveToMemory(status.topicUuid, true);
        if (exportBatch) {
          const exportResults = await this.exportBatch(exportBatch);
          
          if (exportResults.some(r => r.success)) {
            await this.fileManager.markAsExported(status.topicUuid, exportBatch);
          }
          
          results.push({
            topicUuid: status.topicUuid,
            success: exportResults.some(r => r.success),
            results: exportResults
          });
        }
      } catch (error) {
        console.error(`Failed to export topic ${status.topicUuid}:`, error);
        results.push({
          topicUuid: status.topicUuid,
          success: false
        });
      }
    }

    console.log(`✅ Bulk export completed: ${results.filter(r => r.success).length}/${results.length} topics exported`);
    return results;
  }

  private getAuthToken(): string {
    return localStorage.getItem('authToken') || '';
  }
}

// React Hook for easy integration
export function useChatExport(userId: number) {
  const exportService = new BrowserChatExportService(userId);

  const addMessage = async (
    topicUuid: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>
  ) => {
    return await exportService.addMessageWithExport(topicUuid, role, content, metadata);
  };

  const saveToMemory = async (topicUuid: string) => {
    return await exportService.saveToMemory(topicUuid);
  };

  const loadHistory = async (topicUuid: string, limit?: number) => {
    return await exportService.loadChatHistory(topicUuid, limit);
  };

  const getStats = async () => {
    return await exportService.getStorageStats();
  };

  const getExportStatus = async () => {
    return await exportService.getExportStatus();
  };

  const exportAllPending = async () => {
    return await exportService.exportAllPending();
  };

  return {
    addMessage,
    saveToMemory,
    loadHistory,
    getStats,
    getExportStatus,
    exportAllPending
  };
}

export default BrowserChatExportService;