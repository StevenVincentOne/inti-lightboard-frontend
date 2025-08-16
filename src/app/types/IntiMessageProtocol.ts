// Inti WebSocket Message Protocol v1.0
// Versioned message format to prevent breaking changes

export const PROTOCOL_VERSION = "1.0";

// Base message interface - ALL messages must extend this
export interface IntiBaseMessage {
  version: string;
  type: string;
  data?: any;
  timestamp?: number;
  id?: string; // For message acknowledgment
}

// Message types enum for type safety
export enum MessageType {
  // Connection management
  CONNECTION_ESTABLISHED = "connection_established",
  CONNECTED = "connected", 
  HEARTBEAT = "heartbeat",
  PING = "ping",
  PONG = "pong",
  ERROR = "error",
  
  // Authentication
  USER_AUTH = "userAuth",
  REQUEST_USER_STATE = "requestUserState",
  USER_STATE = "userState",
  
  // Text chat
  TEXT_CHAT_SESSION_STARTED = "text_chat.session_started",
  TEXT_CHAT_MESSAGE = "text_chat.message", 
  TEXT_CHAT_MESSAGE_RECEIVED = "text_chat.message_received",
  
  // Document/Topic updates
  TOPIC_UPDATE = "topic_update",
  DOCUMENT_UPDATE = "document_update",
  SGE_UPDATE = "sge_update",
  
  // Voice/Audio
  VOICE_DATA = "voice_data",
  AUDIO_CHUNK = "audio_chunk",
  
  // Navigation
  NAV_CHANGE = "nav_change",
  USER_STATE_CHANGE = "user_state_change"
}

// Specific message interfaces
export interface ConnectionEstablishedMessage extends IntiBaseMessage {
  type: MessageType.CONNECTION_ESTABLISHED;
  data: {
    connectionId: string;
    clientId?: string;
    authenticated?: boolean;
    user?: User;
  };
}

export interface ConnectedMessage extends IntiBaseMessage {
  type: MessageType.CONNECTED;
  data: {
    clientId: string;
    authenticated: boolean;
    user?: User;
  };
}

export interface UserAuthMessage extends IntiBaseMessage {
  type: MessageType.USER_AUTH;
  data: {
    sessionId?: string;
    token?: string;
    userId?: string;
  };
}

export interface RequestUserStateMessage extends IntiBaseMessage {
  type: MessageType.REQUEST_USER_STATE;
  data?: {};
}

export interface UserStateMessage extends IntiBaseMessage {
  type: MessageType.USER_STATE;
  data: {
    user: User;
    authenticated: boolean;
    session?: {
      id: string;
      expiresAt?: number;
    };
  };
}

export interface TextChatMessage extends IntiBaseMessage {
  type: MessageType.TEXT_CHAT_MESSAGE;
  data: {
    content: string;
    role: 'user' | 'assistant';
    conversationId?: string;
    messageId?: string;
  };
}

export interface DocumentUpdateMessage extends IntiBaseMessage {
  type: MessageType.DOCUMENT_UPDATE;
  data: {
    docId: string;
    userId: string;
    content: string;
    sequence?: number;
    chunk?: boolean; // For 1000-token chunks
  };
}

export interface ErrorMessage extends IntiBaseMessage {
  type: MessageType.ERROR;
  data: {
    message: string;
    code?: string;
    details?: any;
  };
}

export interface HeartbeatMessage extends IntiBaseMessage {
  type: MessageType.HEARTBEAT | MessageType.PING | MessageType.PONG;
  data?: {
    timestamp: number;
  };
}

// User interface
export interface User {
  id: string | number;
  username: string | null;
  displayName: string | null;
  email: string | null;
  profileImage?: string;
}

// Message validation functions
export function createMessage<T extends IntiBaseMessage>(
  type: MessageType, 
  data?: any, 
  options?: { id?: string; timestamp?: number }
): T {
  return {
    version: PROTOCOL_VERSION,
    type,
    data,
    timestamp: options?.timestamp || Date.now(),
    id: options?.id || generateMessageId()
  } as T;
}

export function validateMessage(message: any): message is IntiBaseMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  // Check required fields
  if (!message.type || typeof message.type !== 'string') {
    return false;
  }
  
  // Version is optional for backward compatibility
  // but recommended for new messages
  if (message.version && typeof message.version !== 'string') {
    return false;
  }
  
  return true;
}

export function isVersionSupported(version?: string): boolean {
  if (!version) {
    // No version = legacy message, supported for backward compatibility
    return true;
  }
  
  // For now, we only support v1.0
  // Later we can add logic for multiple versions
  return version === "1.0";
}

export function handleLegacyMessage(message: any): IntiBaseMessage {
  // Convert legacy messages to new format
  if (!message.version) {
    return {
      version: "legacy",
      type: message.type,
      data: message.data || message,
      timestamp: Date.now()
    };
  }
  
  return message;
}

// Utility functions
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Message acknowledgment system
export interface MessageAck {
  messageId: string;
  status: 'received' | 'processed' | 'error';
  timestamp: number;
  error?: string;
}

export function createAck(messageId: string, status: MessageAck['status'], error?: string): MessageAck {
  return {
    messageId,
    status,
    timestamp: Date.now(),
    error
  };
}

// Export type unions for type checking
export type IntiMessage = 
  | ConnectionEstablishedMessage
  | ConnectedMessage  
  | UserAuthMessage
  | RequestUserStateMessage
  | UserStateMessage
  | TextChatMessage
  | DocumentUpdateMessage
  | ErrorMessage
  | HeartbeatMessage;