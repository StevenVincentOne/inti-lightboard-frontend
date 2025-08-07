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

const WEBSOCKET_URL_BASE = "wss://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws";

// This hook now manages both communication AND authentication state
export const useIntiCommunication = () => {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Create a comprehensive auth state managed by this hook
  const [authState, setAuthState] = useState<AuthState>({
    loading: true, // Start in a loading state
    authenticated: false,
    user: null,
  });

  // Extract session ID from multiple sources with URL priority (THE FIX!)
  const getSessionId = useCallback(() => {
    // 1. PRIORITY: Check URL parameters (this is the main fix)
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    if (urlSessionId) {
      console.log('[IntiComm] Found session in URL parameter:', urlSessionId.substring(0, 8) + '...');
      return urlSessionId;
    }
    
    // 2. Fallback: Check localStorage (existing logic)
    const localSessionId = localStorage.getItem('intellipedia_session');
    if (localSessionId) {
      console.log('[IntiComm] Found session in localStorage:', localSessionId.substring(0, 8) + '...');
      return localSessionId;
    }
    
    // 3. Check cookies as additional fallback
    const cookieSessionId = document.cookie
      .split(';')
      .find(c => c.trim().startsWith('sessionId='))
      ?.split('=')[1];
    if (cookieSessionId) {
      console.log('[IntiComm] Found session in cookies:', cookieSessionId.substring(0, 8) + '...');
      return cookieSessionId;
    }
    
    // 4. Check sessionStorage as final fallback
    const sessionSessionId = sessionStorage.getItem('sessionId');
    if (sessionSessionId) {
      console.log('[IntiComm] Found session in sessionStorage:', sessionSessionId.substring(0, 8) + '...');
      return sessionSessionId;
    }
    
    console.log('[IntiComm] No session ID found in any source');
    return null;
  }, []);

  const sendMessage = useCallback((type: string, data?: unknown) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, data });
      console.log('[IntiComm] Sending message:', message);
      ws.current.send(message);
    } else {
      console.error('[IntiComm] Cannot send message, WebSocket is not open.');
    }
  }, []);

  const connect = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('[IntiComm] WebSocket already open.');
      return;
    }

    // --- UPDATED SESSION EXTRACTION LOGIC ---
    // Get session ID with URL parameter priority
    const sessionId = getSessionId();
    let websocketUrl = WEBSOCKET_URL_BASE;

    if (sessionId) {
      console.log(`[IntiComm] Authenticating WebSocket with sessionId: ${sessionId.substring(0, 8)}...`);
      websocketUrl = `${WEBSOCKET_URL_BASE}?clientType=PWA&sessionId=${sessionId}`;
    } else {
      console.log('[IntiComm] No session ID found. Connecting WebSocket without authentication.');
      websocketUrl = `${WEBSOCKET_URL_BASE}?clientType=PWA`;
    }
    // --- END OF UPDATED LOGIC ---

    console.log(`[IntiComm] Initializing WebSocket connection to: ${websocketUrl.replace(/sessionId=[^&]+/, 'sessionId=[REDACTED]')}`);
    ws.current = new WebSocket(websocketUrl);

    ws.current.onopen = () => {
      console.log('[IntiComm] WebSocket connection established.');
      setIsConnected(true);
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('[IntiComm] Received message:', message);

      if (message.type === 'connection.established') {
        console.log('[IntiComm] Authentication status received from server:', message.data);
        setAuthState({
          loading: false,
          authenticated: message.data.authenticated,
          user: message.data.user,
        });
      }
    };

    ws.current.onclose = () => {
      console.log('[IntiComm] WebSocket connection closed.');
      setIsConnected(false);
      setAuthState({ loading: false, authenticated: false, user: null });
    };

    ws.current.onerror = (error) => {
      console.error('[IntiComm] WebSocket error:', error);
      setIsConnected(false);
      setAuthState({ loading: false, authenticated: false, user: null });
    };
  }, [getSessionId]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  return {
    isConnected,
    authState,
    sendMessage,
  };
};