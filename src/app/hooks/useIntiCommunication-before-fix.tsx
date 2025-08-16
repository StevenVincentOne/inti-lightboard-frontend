"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  IntiBaseMessage, 
  MessageType, 
  createMessage, 
  validateMessage, 
  isVersionSupported, 
  handleLegacyMessage,
  User,
  UserStateMessage,
  ConnectedMessage,
  ConnectionEstablishedMessage
} from '../types/IntiMessageProtocol';

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
}

interface ConnectionState {
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  lastError: string | null;
}

interface TopicMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

const WEBSOCKET_URL_BASE = "wss://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws";
const RECONNECT_INTERVALS = [1000, 2000, 5000, 10000, 30000];
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000;
const MESSAGE_TIMEOUT = 5000;

export const useIntiCommunication = () => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingMessages = useRef<Map<string, any>>(new Map());
  
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: false,
    reconnectAttempts: 0,
    lastError: null
  });
  
  const [authState, setAuthState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    user: null,
  });
  
  const [lastMessage, setLastMessage] = useState<TopicMessage | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  // Backward compatible isConnected getter
  const isConnected = connectionState.connected;

  // Enhanced session management (preserving existing logic)
  const getSessionId = useCallback(() => {
    // 1. Check URL parameters first (for fresh redirects from Replit)
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    if (urlSessionId) {
      console.log('[IntiComm] Found session in URL parameter:', urlSessionId.substring(0, 8) + '...');
      return urlSessionId;
    }
    
    // 2. Check stored auth data and extract session ID (FIXED)
    const storedAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.sessionId) {
          console.log('[IntiComm] Found stored session:', parsed.sessionId.substring(0, 8) + '...');
          return parsed.sessionId;
        }
        
        // Fallback to legacy user-based session generation
        if (parsed.user) {
          if (parsed.user.id) {
            return `user_${parsed.user.id}`;
          }
          if (parsed.user.username) {
            return `username_${parsed.user.username}`;
          }
        }
      } catch (e) {
        console.warn('[IntiComm] Failed to parse stored auth:', e);
      }
    }
    
    // 3. Look for legacy session format
    const legacySessionId = localStorage.getItem('sessionId') || sessionStorage.getItem('sessionId');
    if (legacySessionId) {
      console.log('[IntiComm] Found legacy session ID');
      return legacySessionId;
    }
    
    return null;
  }, []);

  // Check for bad cached data (preserving existing logic)
  const checkStoredAuth = useCallback(() => {
    const storedAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.user && parsed.user.displayName === "User 1") {
          localStorage.removeItem("inti_auth");
          sessionStorage.removeItem("inti_auth");
          console.log("[IntiComm] Clearing bad cached User 1 data");
          return false;
        }
        if (parsed.user) {
          console.log("[IntiComm] Found valid stored user:", parsed.user.displayName || parsed.user.username);
          return true;
        }
      } catch (e) {
        console.warn('[IntiComm] Failed to parse stored auth:', e);
      }
    }
    return false;
  }, []);

  // Enhanced message sending with timeout and validation
  const sendMessage = useCallback((message: any, waitForResponse = false): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        // Convert legacy message format if needed
        let formattedMessage: IntiBaseMessage;
        if (typeof message === 'string') {
          // Handle raw string messages (legacy)
          ws.current.send(message);
          resolve(null);
          return;
        } else if (!message.version) {
          // Convert to new format
          formattedMessage = createMessage(message.type, message.data);
        } else {
          formattedMessage = message;
        }

        // Validate message
        if (!validateMessage(formattedMessage)) {
          console.warn('[IntiComm] Invalid message format, sending anyway for compatibility');
        }

        // Handle pending responses
        if (waitForResponse && formattedMessage.id) {
          const timeout = setTimeout(() => {
            pendingMessages.current.delete(formattedMessage.id!);
            reject(new Error(`Message timeout: ${formattedMessage.type}`));
          }, MESSAGE_TIMEOUT);

          pendingMessages.current.set(formattedMessage.id, {
            resolve,
            reject,
            timeout
          });
        }

        console.log('[IntiComm] Sending message:', formattedMessage.type, formattedMessage.version || 'legacy');
        ws.current.send(JSON.stringify(formattedMessage));
        
        if (!waitForResponse) {
          resolve(null);
        }
      } catch (error) {
        console.error('[IntiComm] Failed to send message:', error);
        reject(error);
      }
    });
  }, []);

  // Enhanced message handling with version support
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const rawMessage = JSON.parse(event.data);
      console.log('[IntiComm] Received message:', rawMessage);

      // Validate and normalize message
      let message: IntiBaseMessage;
      if (validateMessage(rawMessage)) {
        // Check version compatibility
        if (!isVersionSupported(rawMessage.version)) {
          console.warn('[IntiComm] Unsupported message version:', rawMessage.version);
          // Still process for compatibility
        }
        message = rawMessage.version ? rawMessage : handleLegacyMessage(rawMessage);
      } else {
        // Legacy message format
        message = handleLegacyMessage(rawMessage);
      }

      // Handle pending message responses
      if (message.id && pendingMessages.current.has(message.id)) {
        const pending = pendingMessages.current.get(message.id)!;
        clearTimeout(pending.timeout);
        pendingMessages.current.delete(message.id);
        pending.resolve(message);
        return;
      }

      // Process different message types (preserving existing logic)
      if (message.type === 'connection_established' || message.type === MessageType.CONNECTION_ESTABLISHED) {
        console.log('[IntiComm] Connection established, setting client ID:', message.data?.connectionId);
        setClientId(message.data?.connectionId || message.data?.clientId);
        
        if (message.data?.authenticated !== undefined) {
          setAuthState(prev => ({
            ...prev,
            authenticated: message.data.authenticated
          }));
        }
        
        setConnectionState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          reconnectAttempts: 0,
          lastError: null
        }));
      }

      // Handle connected message (new format)
      if (message.type === 'connected' || message.type === MessageType.CONNECTED) {
        console.log('[IntiComm] Connected with user data:', message.data);
        setClientId(message.data?.clientId);
        
        setAuthState({
          loading: false,
          authenticated: message.data?.authenticated || false,
          user: message.data?.user || null
        });
        
        setConnectionState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          reconnectAttempts: 0,
          lastError: null
        }));
      }

      // Set last message for components to consume (backward compatibility)
      setLastMessage({
        type: message.type,
        data: message.data || message,
        timestamp: Date.now()
      });

      // Handle text chat messages - forward to text chat component
      if (message.type.startsWith('text_chat.')) {
        window.dispatchEvent(new CustomEvent('intiChatMessage', { 
          detail: message 
        }));
      }

      // Handle general chat messages (legacy support)
      if (message.type.startsWith('chat.')) {
        window.dispatchEvent(new CustomEvent('intiChatMessage', { 
          detail: message 
        }));
      }

      // Handle legacy connection established
      if (message.type === 'connection.established') {
        console.log('[IntiComm] Authentication status received from server:', message.data);
        
        if (message.data?.authenticated && message.data?.user) {
          console.log("[DEBUG] User object received:", JSON.stringify(message.data.user));
          setAuthState({
            loading: false,
            authenticated: true,
            user: message.data.user,
          });
        } else {
          setAuthState(prev => ({
            ...prev,
            loading: false,
            authenticated: message.data?.authenticated || false
          }));
        }
      }

      // Handle errors
      if (message.type === 'error' || message.type === MessageType.ERROR) {
        console.error('[IntiComm] WebSocket error:', message.data);
        
        if (message.data?.message && message.data.message.includes('Authentication')) {
          localStorage.removeItem('inti_auth');
          sessionStorage.removeItem('inti_auth');
          setAuthState({
            loading: false,
            authenticated: false,
            user: null
          });
        }
        
        setConnectionState(prev => ({
          ...prev,
          lastError: message.data?.message || 'Unknown error'
        }));
      }

      // Handle heartbeat
      if (message.type === 'pong' || message.type === MessageType.PONG) {
        console.log('[IntiComm] Heartbeat response received');
      }

    } catch (error) {
      console.error('[IntiComm] Failed to process message:', error);
    }
  }, []);

  // Enhanced heartbeat system
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
    }
    
    heartbeatTimer.current = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        const ping = createMessage(MessageType.PING, { timestamp: Date.now() });
        sendMessage(ping).catch(console.warn);
      }
    }, HEARTBEAT_INTERVAL);
  }, [sendMessage]);

  // Enhanced connection with reconnection logic
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.CONNECTING || 
        ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const sessionId = getSessionId();
    if (!sessionId) {
      console.log('[IntiComm] No session ID available, cannot connect');
      setAuthState(prev => ({ ...prev, loading: false }));
      return;
    }

    const url = `${WEBSOCKET_URL_BASE}?session=${sessionId}`;
    console.log('[IntiComm] Connecting to WebSocket...');
    
    setConnectionState(prev => ({ 
      ...prev, 
      connecting: true, 
      lastError: null 
    }));

    try {
      ws.current = new WebSocket(url);
      
      ws.current.onopen = () => {
        console.log('[IntiComm] ✅ WebSocket connected successfully');
        setConnectionState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          reconnectAttempts: 0,
          lastError: null
        }));
        startHeartbeat();
      };
      
      ws.current.onmessage = handleMessage;
      
      ws.current.onclose = (event) => {
        console.log('[IntiComm] WebSocket closed:', event.code, event.reason);
        setConnectionState(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false,
          lastError: event.reason || `Connection closed (${event.code})`
        }));
        
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = null;
        }
        
        // Clear pending messages
        pendingMessages.current.forEach(pending => {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Connection closed'));
        });
        pendingMessages.current.clear();
        
        // Attempt reconnection unless it was a clean close
        if (event.code !== 1000) {
          scheduleReconnect();
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('[IntiComm] WebSocket error:', error);
        setConnectionState(prev => ({ 
          ...prev, 
          lastError: 'Connection error',
          connecting: false
        }));
      };
      
    } catch (error) {
      console.error('[IntiComm] Failed to create WebSocket:', error);
      setConnectionState(prev => ({ 
        ...prev, 
        connecting: false,
        lastError: 'Failed to create connection'
      }));
      scheduleReconnect();
    }
  }, [getSessionId, handleMessage, startHeartbeat]);

  // Schedule reconnection with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    
    setConnectionState(prev => {
      if (prev.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[IntiComm] Max reconnect attempts reached');
        return { ...prev, lastError: 'Max reconnection attempts reached' };
      }
      
      const delay = RECONNECT_INTERVALS[Math.min(prev.reconnectAttempts, RECONNECT_INTERVALS.length - 1)];
      console.log(`[IntiComm] Scheduling reconnect in ${delay}ms (attempt ${prev.reconnectAttempts + 1})`);
      
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
      
      return { ...prev, reconnectAttempts: prev.reconnectAttempts + 1 };
    });
  }, [connect]);

  // Initialize connection
  useEffect(() => {
    checkStoredAuth();
    connect();
    
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
      ws.current?.close();
    };
  }, [connect, checkStoredAuth]);

  // Backward compatible return interface
  return {
    isConnected,
    authState,
    lastMessage,
    clientId,
    sendMessage,
    connect,
    checkStoredAuth,
    
    // New enhanced features
    connectionState,
    reconnectAttempts: connectionState.reconnectAttempts,
    connectionError: connectionState.lastError,
    isConnecting: connectionState.connecting,
    
    // Convenience getters for backward compatibility
    user: authState.user,
    isAuthenticated: authState.authenticated,
    isLoading: authState.loading
  };
};