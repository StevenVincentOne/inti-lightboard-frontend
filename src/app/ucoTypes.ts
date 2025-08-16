/**
 * Unified Context Object (UCO) TypeScript Interfaces
 * Shared between TensorDock PWA and Replit Backend
 * Version: 1.0.0
 * Created: August 14, 2025
 */

// Core Types
export type ConversationMode = 'voice' | 'text' | 'mixed';
export type TopicStage = 'draft' | 'ai' | 'revision' | 'final';
export type MessageRole = 'user' | 'assistant' | 'system';
export type InsightType = 'entity' | 'pattern' | 'recommendation' | 'warning';

// Sync Status
export interface SyncStatus {
  status: 'synced' | 'syncing' | 'pending' | 'error';
  lastSync: number;
  error?: string;
}

// Graph References
export interface GraphReference {
  nodeId: string;
  lastSync: number;
  cachedRelationships?: GraphEdge[];
  cachedNodes?: GraphNode[];
}

// Conversation Types
export interface ConversationTurn {
  id: string;
  type: 'voice' | 'text';
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    transcriptionConfidence?: number;
    emotions?: string[];
    entities?: string[];
    topicUuid?: string;
  };
}

// Graph Types
export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, any>;
  embedding?: number[];
  lastModified: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  properties: Record<string, any>;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  components: string[];
  trigger: string;
  response: string;
}

export interface Insight {
  id: string;
  componentId: string;
  type: InsightType;
  content: string;
  significance: number;
  newNodes?: GraphNode[];
  newEdges?: GraphEdge[];
  timestamp: number;
}

// File References
export interface FileReference {
  path: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  content?: string;
}

// Actions
export interface Action {
  id: string;
  type: string;
  target: string;
  payload: any;
  timestamp: number;
  result?: any;
}

// Component Data Interfaces
export interface UserComponentData {
  id: number;
  name: string;
  bio: string;
  preferences: Record<string, any>;
  currentActivity: string;
  currentDraftUuid?: string;
  draftLoadedAt?: string;
}

export interface TopicComponentData {
  loaded: boolean;
  uuid: string | null;
  title: string | null;
  stage: TopicStage;
  content: Record<string, string>;
  metadata: Record<string, any>;
}

export interface ConversationComponentData {
  mode: ConversationMode;
  recent: ConversationTurn[];
  summary: string;
  intent: string;
  sentiment: string;
}

export interface FilesComponentData {
  active: FileReference[];
  recent: FileReference[];
  mentioned: string[];
}

export interface ActionsComponentData {
  userActions: Action[];
  aiActions: Action[];
  pendingActions: Action[];
}

// Component Structure
export interface UCOComponent<T> {
  data: T;
  graphRef?: GraphReference;
}

// Active Graph Layer
export interface ActiveGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  patterns: Pattern[];
  index: {
    byComponent: Map<string, Set<string>>;
    byType: Map<string, Set<string>>;
    byRecency: string[];
  };
  stats: {
    totalNodes: number;
    totalEdges: number;
    coverage: Map<string, number>;
    lastRefresh: number;
    cacheHitRate: number;
  };
}

// Insights Layer
export interface InsightRequest {
  componentId: string;
  priority: number;
  query: string;
  timestamp: number;
}

export interface InsightsLayer {
  queue: InsightRequest[];
  active: Map<string, Insight>;
  history: Insight[];
  recommendations: any[];
}

// Memory Layer
export interface MemoryLayer {
  shortTerm: any[];
  workingMemory: any[];
  episodic: any[];
  semantic: Map<string, any>;
}

// Main UCO Interface
export interface UnifiedContextObject {
  metadata: {
    version: string;
    sessionId: string;
    timestamp: number;
    syncStatus: Map<string, SyncStatus>;
  };
  
  components: {
    user: UCOComponent<UserComponentData>;
    topic: UCOComponent<TopicComponentData>;
    conversation: UCOComponent<ConversationComponentData>;
    files: UCOComponent<FilesComponentData>;
    actions: UCOComponent<ActionsComponentData>;
  };
  
  activeGraph: ActiveGraph;
  insights: InsightsLayer;
  memory: MemoryLayer;
}

// UCO Snapshot for Persistence
export interface UCOSnapshot {
  uco: UnifiedContextObject;
  timestamp: number;
  sessionId: string;
  userId: number;
  topicUuid?: string;
}

// WebSocket Message Types for UCO
export interface UCOWebSocketMessage {
  type: 'uco.update' | 'uco.get_state' | 'uco.load_context' | 'uco.save_snapshot' | 'uco.sync';
  data?: any;
  timestamp: number;
}

// UCO Update Payload
export interface UCOUpdatePayload {
  component: keyof UnifiedContextObject['components'];
  update: any;
  syncGraph?: boolean;
}

// UCO Configuration
export interface UCOConfig {
  cache: {
    ttl: number;
    maxNodes: number;
    preloadRadius: number;
  };
  persistence: {
    snapshotInterval: number;
    maxSnapshots: number;
    compressionThreshold: number;
  };
  llm: {
    model: string;
    maxContext: number;
    reserveTokens: number;
  };
  insights: {
    queueSize: number;
    maxConcurrent: number;
    timeout: number;
  };
}

// Export default configuration
export const DEFAULT_UCO_CONFIG: UCOConfig = {
  cache: {
    ttl: 300000, // 5 minutes
    maxNodes: 10000,
    preloadRadius: 2
  },
  persistence: {
    snapshotInterval: 60000, // 1 minute
    maxSnapshots: 100,
    compressionThreshold: 1024 * 1024 // 1MB
  },
  llm: {
    model: "gemma-3n",
    maxContext: 32768,
    reserveTokens: 2000
  },
  insights: {
    queueSize: 100,
    maxConcurrent: 5,
    timeout: 5000
  }
};