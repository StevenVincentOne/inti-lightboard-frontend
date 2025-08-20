"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

interface User {
  id: string | number;
  username: string | null;
  displayName: string | null;
  email: string | null;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
}

interface TopicMessage {
  type: string;
  data: unknown;
  timestamp: number;
}

const WEBSOCKET_URL_BASE = "wss://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws";

// This hook now manages both communication AND authentication state
export const useIntiCommunication = () => {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<TopicMessage | null>(null);
  
  // Create a comprehensive auth state managed by this hook
  const [authState, setAuthState] = useState<AuthState>({
    loading: true, // Start in a loading state
    authenticated: false,
    user: null,
  });

  // Fixed session/auth extraction to match main PWA storage keys
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
        if (parsed.authenticated && parsed.user) {
          console.log('[IntiComm] Found stored auth data for user:', parsed.user.displayName || parsed.user.username);
          
          // FIXED: Extract actual session ID from stored auth
          if (parsed.sessionId) {
            console.log('[IntiComm] Using stored session ID for WebSocket authentication');
            return parsed.sessionId;
          }
          
          // If no sessionId, use user ID as session
          if (parsed.user && parsed.user.id) {
            console.log('[IntiComm] No session ID in stored auth, using user ID as session');
            return `user_${parsed.user.id}`;
          }
          
          // Last resort: use username as session identifier
          if (parsed.user && parsed.user.username) {
            console.log('[IntiComm] Using username as session identifier');
            return `username_${parsed.user.username}`;
          }
        }
      } catch {
        console.log('[IntiComm] Invalid stored auth data, clearing...');
        localStorage.removeItem('inti_auth');
        sessionStorage.removeItem('inti_auth');
      }
    }
    
    // 3. Legacy session storage check (fallback)
    const legacySessionId = localStorage.getItem('intellipedia_session') || 
                           sessionStorage.getItem('sessionId') ||
                           document.cookie.split(';').find(c => c.trim().startsWith('sessionId='))?.split('=')[1];
    
    if (legacySessionId) {
      console.log('[IntiComm] Found legacy session:', legacySessionId.substring(0, 8) + '...');
      return legacySessionId;
    }
    
    console.log('[IntiComm] No session ID or auth data found in any source');
    return null;
  }, []);

  // Check for stored auth and set initial state
  const checkStoredAuth = useCallback(() => {
    const storedAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.authenticated && parsed.user && parsed.user.displayName && parsed.user.displayName !== 'Replit User') {
          console.log('[IntiComm] Found valid stored authentication:', parsed.user.displayName);
          setAuthState({
            loading: false,
            authenticated: true,
            user: parsed.user
          });
          return true;
        }
      } catch {
        localStorage.removeItem('inti_auth');
        sessionStorage.removeItem('inti_auth');
      }
    }
    return false;
  }, []);

  const [clientId, setClientId] = useState<string | null>(null);

  const sendMessage = useCallback((type: string, data?: unknown) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // Updated to match Replit Agent's expected format
      const message = {
        type,
        clientId: clientId || 'unknown',
        data: data || {},
        timestamp: Date.now()
      };
      const messageStr = JSON.stringify(message);
      console.log('[IntiComm] Sending message:', messageStr);
      ws.current.send(messageStr);
    } else {
      console.error('[IntiComm] Cannot send message - WebSocket not connected:', { type, data });
    }
  }, [clientId]);

  const connect = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('[IntiComm] WebSocket already open.');
      return;
    }

    // Get session ID or check for stored auth
    const sessionInfo = getSessionId();
    let websocketUrl = WEBSOCKET_URL_BASE;

    if (sessionInfo) {
      console.log(`[IntiComm] Authenticating WebSocket with sessionId: ${sessionInfo.substring(0, 8)}...`);
      websocketUrl = `${WEBSOCKET_URL_BASE}?clientType=PWA&sessionId=${sessionInfo}`;
    } else {
      console.log('[IntiComm] No session ID found. Connecting WebSocket without authentication.');
      websocketUrl = `${WEBSOCKET_URL_BASE}?clientType=PWA`;
    }

    console.log(`[IntiComm] Initializing WebSocket connection to: ${websocketUrl.replace(/sessionId=[^&]+/, 'sessionId=[REDACTED]')}`);
    ws.current = new WebSocket(websocketUrl);

    ws.current.onopen = () => {
      console.log('[IntiComm] WebSocket connection established.');
      setIsConnected(true);
      // Authentication happens via sessionId in the connection URL
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('[IntiComm] Received message:', message);

      // Handle auth.response message
      if (message.type === 'auth.response') {
        console.log('[IntiComm] 🔐 Auth response received:', message);
        if (message.success && message.authenticated) {
          setIsConnected(true);
          setClientId(message.clientId || message.data?.clientId || 'authenticated');
          
          if (message.user) {
            console.log('[IntiComm] ✅ Successfully authenticated user:', message.user.displayName || message.user.username);
            // Store authenticated user
            setAuthState({
              loading: false,
              authenticated: true,
              user: message.user
            });
            const authData = { user: message.user, authenticated: true };
            localStorage.setItem('inti_auth', JSON.stringify(authData));
            sessionStorage.setItem('inti_auth', JSON.stringify(authData));
          }
        } else {
          console.log('[IntiComm] ❌ Authentication failed:', message.message || 'Unknown error');
        }
        return;
      }
      
      // Handle "connected" message type (simple connection acknowledgment)
      if (message.type === 'connected') {
        console.log('[IntiComm] ✅ Connection established:', message);
        setIsConnected(true);
        if (message.data) {
          setClientId(message.data.clientId || message.clientId);
          if (message.data.user) {
            // Store authenticated user
            setAuthState({
              loading: false,
              authenticated: true,
              user: message.data.user
            });
            const authData = { user: message.data.user, authenticated: true };
            localStorage.setItem('inti_auth', JSON.stringify(authData));
            sessionStorage.setItem('inti_auth', JSON.stringify(authData));
          }
        }
        return; // Don't process further
      }

      // Handle connection establishment (Replit Agent format)
      if (message.type === 'connection_established') {
        console.log('[IntiComm] Connection established, setting client ID:', message.data.connectionId);
        setClientId(message.data.connectionId || message.data.clientId);
        
        // If authenticated, update auth state
        if (message.data.authenticated !== undefined) {
          setAuthState(prev => ({
            ...prev,
            authenticated: message.data.authenticated
          }));
        }
      }

      // Set last message for components to consume
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
        
        // FIXED: Better auth state management
        if (message.data.authenticated && message.data.user) {
          setAuthState({
            loading: false,
            authenticated: true,
            user: message.data.user,
          });
          
          // Store auth with session info
          const authData = { user: message.data.user, authenticated: true, sessionId: getSessionId() };
          localStorage.setItem('inti_auth', JSON.stringify(authData));
          sessionStorage.setItem('inti_auth', JSON.stringify(authData));
        } else {
          // Only clear auth if we don't have valid stored auth
          const hasStoredAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
          if (!hasStoredAuth) {
            console.log('[IntiComm] No server auth and no stored auth - setting unauthenticated state');
            setAuthState({
              loading: false,
              authenticated: false,
              user: null,
            });
          } else {
            console.log('[IntiComm] Server session not recognized, but maintaining stored authentication for user experience');
            setAuthState(prev => ({ ...prev, loading: false }));
          }
        }
      }

      // Handle errors
      if (message.type === 'error') {
        console.error('[IntiComm] WebSocket error:', message.data);
        
        // If authentication error, clear stored auth
        if (message.data.message && message.data.message.includes('Authentication')) {
          localStorage.removeItem('inti_auth');
          setAuthState({
            loading: false,
            authenticated: false,
            user: null
          });
        }
      }
    };

    ws.current.onclose = () => {
      console.log('[IntiComm] WebSocket connection closed.');
      setIsConnected(false);
      setClientId(null);
      // Don't clear auth state on disconnect - user might still be authenticated
    };

    ws.current.onerror = (error) => {
      console.error('[IntiComm] WebSocket error:', error);
      setIsConnected(false);
      setClientId(null);
    };
  }, [getSessionId]);

  useEffect(() => {
    // First check for stored auth
    checkStoredAuth();
    // Always connect for real-time updates
    connect();
    
    return () => {
      ws.current?.close();
    };
  }, [connect, checkStoredAuth]);

  return {
    isConnected,
    authState,
    lastMessage,
    clientId,
    sendMessage,
    connect,
    checkStoredAuth
  };
};