/**
 * UCOManager - Unified Context Object Manager
 * Core state management for Inti system
 * Version: 1.0.0
 * Created: August 14, 2025
 */

import {
  UnifiedContextObject,
  UCOSnapshot,
  UCOConfig,
  DEFAULT_UCO_CONFIG,
  ConversationTurn,
  SyncStatus,
  UCOUpdatePayload,
  ConversationMode
} from './ucoTypes';

export interface UCOSubscriber {
  id: string;
  onUpdate: (event: string, data: any) => void;
}

export class UCOManager {
  private uco: UnifiedContextObject;
  private config: UCOConfig;
  private subscribers: Set<UCOSubscriber> = new Set();
  private snapshotTimer?: NodeJS.Timeout;
  
  constructor(sessionId: string, userId: number, config: Partial<UCOConfig> = {}) {
    this.config = { ...DEFAULT_UCO_CONFIG, ...config };
    this.uco = this.initializeUCO(sessionId, userId);
    this.startAutoSnapshot();
  }
  
  private initializeUCO(sessionId: string, userId: number): UnifiedContextObject {
    return {
      metadata: {
        version: '1.0.0',
        sessionId,
        timestamp: Date.now(),
        syncStatus: new Map([
          ['user', { status: 'synced', lastSync: Date.now() }],
          ['topic', { status: 'pending', lastSync: 0 }],
          ['conversation', { status: 'synced', lastSync: Date.now() }],
          ['files', { status: 'synced', lastSync: Date.now() }],
          ['actions', { status: 'synced', lastSync: Date.now() }]
        ])
      },
      
      components: {
        user: {
          data: {
            id: userId,
            name: '',
            bio: '',
            preferences: {},
            currentActivity: 'initializing'
          },
          graphRef: {
            nodeId: `user_${userId}`,
            lastSync: 0
          }
        },
        
        topic: {
          data: {
            loaded: false,
            uuid: null,
            title: null,
            stage: 'draft',
            content: {},
            metadata: {}
          },
          graphRef: {
            nodeId: '',
            lastSync: 0
          }
        },
        
        conversation: {
          data: {
            mode: 'text' as ConversationMode,
            recent: [],
            summary: '',
            intent: '',
            sentiment: 'neutral'
          },
          graphRef: {
            nodeId: '',
            lastSync: 0,
            cachedRelationships: []
          }
        },
        
        files: {
          data: {
            active: [],
            recent: [],
            mentioned: []
          },
          graphRef: {
            nodeId: '',
            lastSync: 0
          }
        },
        
        actions: {
          data: {
            userActions: [],
            aiActions: [],
            pendingActions: []
          },
          graphRef: {
            nodeId: '',
            lastSync: 0
          }
        }
      },
      
      activeGraph: {
        nodes: new Map(),
        edges: new Map(),
        patterns: [],
        index: {
          byComponent: new Map(),
          byType: new Map(),
          byRecency: []
        },
        stats: {
          totalNodes: 0,
          totalEdges: 0,
          coverage: new Map(),
          lastRefresh: Date.now(),
          cacheHitRate: 0
        }
      },
      
      insights: {
        queue: [],
        active: new Map(),
        history: [],
        recommendations: []
      },
      
      memory: {
        shortTerm: [],
        workingMemory: [],
        episodic: [],
        semantic: new Map()
      }
    };
  }
  
  // Get current UCO state
  getState(): UnifiedContextObject {
    return this.uco;
  }
  
  // Update a component
  async updateComponent<K extends keyof UnifiedContextObject['components']>(
    component: K,
    data: Partial<UnifiedContextObject['components'][K]['data']>
  ): Promise<void> {
    // Update immediate data
    this.uco.components[component].data = {
      ...this.uco.components[component].data,
      ...data
    };
    
    // Update sync status
    this.updateSyncStatus(component, 'synced');
    
    // Update timestamp
    this.uco.metadata.timestamp = Date.now();
    
    // Notify subscribers
    this.notifySubscribers('component_updated', { component, data });
  }
  
  // Add conversation turn (unified voice/text)
  async addConversationTurn(turn: ConversationTurn): Promise<void> {
    const conversation = this.uco.components.conversation.data;
    
    // Add to recent conversations
    conversation.recent.push(turn);
    
    // Maintain window size (keep last 50 turns)
    if (conversation.recent.length > 50) {
      conversation.recent.shift();
    }
    
    // Update mode if needed
    if (turn.type === 'voice' && conversation.mode === 'text') {
      conversation.mode = 'mixed';
    } else if (turn.type === 'text' && conversation.mode === 'voice') {
      conversation.mode = 'mixed';
    }
    
    // Update component
    await this.updateComponent('conversation', conversation);
    
    // Notify about new turn
    this.notifySubscribers('conversation_turn', turn);
  }
  
  // Load topic context
  async loadTopicContext(topicUuid: string, topicData: any): Promise<void> {
    await this.updateComponent('topic', {
      loaded: true,
      uuid: topicUuid,
      title: topicData.title || 'Untitled',
      stage: topicData.stage || 'draft',
      content: topicData.content || {},
      metadata: topicData.metadata || {}
    });
    
    // Update graph reference
    if (this.uco.components.topic.graphRef) {
      this.uco.components.topic.graphRef.nodeId = `topic_${topicUuid}`;
    }
    
    this.notifySubscribers('topic_loaded', topicUuid);
  }
  
  // Subscribe to UCO updates
  subscribe(subscriber: UCOSubscriber): void {
    this.subscribers.add(subscriber);
  }
  
  // Unsubscribe from updates
  unsubscribe(subscriberId: string): void {
    const subscriber = Array.from(this.subscribers).find(s => s.id === subscriberId);
    if (subscriber) {
      this.subscribers.delete(subscriber);
    }
  }
  
  // Notify all subscribers
  private notifySubscribers(event: string, data: any): void {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber.onUpdate(event, data);
      } catch (error) {
        console.error(`Error notifying subscriber ${subscriber.id}:`, error);
      }
    });
  }
  
  // Update sync status
  private updateSyncStatus(component: string, status: SyncStatus['status']): void {
    const currentStatus = this.uco.metadata.syncStatus.get(component);
    if (currentStatus) {
      currentStatus.status = status;
      currentStatus.lastSync = Date.now();
    }
  }
  
  // Create snapshot
  createSnapshot(): UCOSnapshot {
    return {
      uco: JSON.parse(JSON.stringify(this.uco)), // Deep clone
      timestamp: Date.now(),
      sessionId: this.uco.metadata.sessionId,
      userId: this.uco.components.user.data.id,
      topicUuid: this.uco.components.topic.data.uuid || undefined
    };
  }
  
  // Load from snapshot
  loadSnapshot(snapshot: UCOSnapshot): void {
    // Convert Maps back from JSON
    snapshot.uco.metadata.syncStatus = new Map(
      Object.entries(snapshot.uco.metadata.syncStatus as any)
    );
    snapshot.uco.activeGraph.nodes = new Map(
      Object.entries(snapshot.uco.activeGraph.nodes as any)
    );
    snapshot.uco.activeGraph.edges = new Map(
      Object.entries(snapshot.uco.activeGraph.edges as any)
    );
    snapshot.uco.insights.active = new Map(
      Object.entries(snapshot.uco.insights.active as any)
    );
    snapshot.uco.memory.semantic = new Map(
      Object.entries(snapshot.uco.memory.semantic as any)
    );
    
    this.uco = snapshot.uco;
    this.notifySubscribers('snapshot_loaded', snapshot);
  }
  
  // Start auto-snapshot timer
  private startAutoSnapshot(): void {
    if (this.config.persistence.snapshotInterval > 0) {
      this.snapshotTimer = setInterval(() => {
        const snapshot = this.createSnapshot();
        this.saveSnapshot(snapshot);
      }, this.config.persistence.snapshotInterval);
    }
  }
  
  // Save snapshot (to be implemented with persistence layer)
  private async saveSnapshot(snapshot: UCOSnapshot): Promise<void> {
    // This will be implemented with actual persistence
    // For now, just notify subscribers
    this.notifySubscribers('snapshot_saved', snapshot);
  }
  
  // Clean up
  destroy(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }
    this.subscribers.clear();
  }
  
  // Get context for LLM
  getLLMContext(maxTokens: number = 4000): any {
    const context = {
      user: this.uco.components.user.data,
      topic: this.uco.components.topic.data.loaded ? {
        uuid: this.uco.components.topic.data.uuid,
        title: this.uco.components.topic.data.title,
        stage: this.uco.components.topic.data.stage
      } : null,
      recentConversation: this.uco.components.conversation.data.recent.slice(-10),
      mode: this.uco.components.conversation.data.mode,
      intent: this.uco.components.conversation.data.intent,
      activeFiles: this.uco.components.files.data.active.map(f => f.name),
      sessionId: this.uco.metadata.sessionId
    };
    
    return context;
  }
}