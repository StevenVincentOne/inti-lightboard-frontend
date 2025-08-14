// Combined Inti Communication and Authentication Provider
// File: /frontend/src/app/components/IntiCommunicationProvider.tsx

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface User {
  id: string | number;
  username: string | null;
  displayName: string | null;
  email: string | null;
  profileImage: string | null;
}

interface IntiCommunicationState {
  loading: boolean;
  user: User | null;
  authenticated: boolean;
  error: string | null;
  connected: boolean;
  clientId: string | null;
}

interface IntiCommunicationActions {
  // Connection management
  sendMessage: (type: string, data?: unknown) => void;
  
  // Voice interaction
  sendVoiceTranscription: (transcription: string, audioData?: unknown) => void;
  
  // Auth functionality
  logout: () => void;
  refreshAuth: () => void;
}

type IntiCommunicationContextType = IntiCommunicationState & IntiCommunicationActions;

const IntiCommunicationContext = createContext<IntiCommunicationContextType | undefined>(undefined);

const REPLIT_WS_URL = 'wss://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws';

// Helper function to extract profile image from user data with proper field mapping
const extractProfileImage = (userData: Record<string, unknown>): string | null => {
  // Handle multiple possible field names from the backend
  const profileImage = userData.profileImage as string;
  const profileImageUrl = userData.profile_image_url as string;
  const profileImageAlt = userData.profile_image as string;
  
  return profileImage || profileImageUrl || profileImageAlt || null;
};

export function IntiCommunicationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IntiCommunicationState>({
    loading: true,
    user: null,
    authenticated: false,
    error: null,
    connected: false,
    clientId: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      const { type, data } = message;

      console.log('[IntiComm] Received message:', { type, data });

      switch (type) {
        case 'connection.established':
          console.log('[IntiComm] ✅ Connection established:', data);
          
          // Check if connection includes authentication data
          if (data?.authenticated && data?.user && data.user.displayName && data.user.displayName !== 'Replit User') {
            const user: User = {
              id: data.user.id || data.user.userId || 'authenticated_user',
              displayName: data.user.displayName,
              username: data.user.username || data.user.displayName,
              email: data.user.email || null,
              profileImage: extractProfileImage(data.user)
            };

            console.log('[IntiComm] ✅ Authentication included in connection:', user.displayName);
            console.log('[IntiComm] Profile image extracted:', user.profileImage);
            
            const authData = { user, authenticated: true };
            localStorage.setItem('inti_auth', JSON.stringify(authData));
            sessionStorage.setItem('inti_auth', JSON.stringify(authData));

            setState(prev => ({
              ...prev,
              loading: false,
              connected: true,
              clientId: data?.clientId || data?.connectionId || prev.clientId,
              user,
              authenticated: true,
              error: null
            }));

            if (authCheckTimeoutRef.current) {
              clearTimeout(authCheckTimeoutRef.current);
              authCheckTimeoutRef.current = null;
            }
          } else {
            setState(prev => ({
              ...prev,
              loading: false,
              connected: true,
              clientId: data?.clientId || data?.connectionId || prev.clientId
            }));
          }
          break;

        case 'userState':
          console.log('[IntiComm] 👤 User state received:', data);
          if (data?.authenticated && data?.displayName && data?.displayName !== 'Replit User') {
            const user: User = {
              id: data.userId || data.id || 'authenticated_user',
              displayName: data.displayName,
              username: data.username || data.displayName,
              email: data.email || null,
              profileImage: extractProfileImage(data)
            };

            console.log('[IntiComm] ✅ Successfully authenticated user:', user.displayName);
            console.log('[IntiComm] Profile image extracted:', user.profileImage);
            
            const authData = { user, authenticated: true };
            localStorage.setItem('inti_auth', JSON.stringify(authData));
            sessionStorage.setItem('inti_auth', JSON.stringify(authData));

            setState(prev => ({
              ...prev,
              loading: false,
              user,
              authenticated: true,
              error: null
            }));

            if (authCheckTimeoutRef.current) {
              clearTimeout(authCheckTimeoutRef.current);
              authCheckTimeoutRef.current = null;
            }
          } else {
            console.log('[IntiComm] User not authenticated or missing displayName');
            setState(prev => ({
              ...prev,
              loading: false,
              user: null,
              authenticated: false,
              error: null
            }));
          }
          break;

        case 'ping':
          // Respond to ping with pong
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
          break;

        case 'auth.logout_success':
          console.log('[IntiComm] ✅ Logout successful:', data);
          // Clear all auth data
          localStorage.removeItem('inti_auth');
          sessionStorage.removeItem('inti_auth');
          localStorage.removeItem('sessionId');
          sessionStorage.removeItem('sessionId');
          
          setState(prev => ({
            ...prev,
            loading: false,
            user: null,
            authenticated: false,
            error: null
          }));
          
          // Dispatch logout event for other components
          window.dispatchEvent(new CustomEvent('inti-logout', { detail: { success: true } }));
          break;

        case 'auth.user_logged_out':
          console.log('[IntiComm] 🚪 User logged out from another client:', data);
          // Clear all auth data
          localStorage.removeItem('inti_auth');
          sessionStorage.removeItem('inti_auth');
          localStorage.removeItem('sessionId');
          sessionStorage.removeItem('sessionId');
          
          setState(prev => ({
            ...prev,
            loading: false,
            user: null,
            authenticated: false,
            error: null
          }));
          
          // Dispatch logout event for other components
          window.dispatchEvent(new CustomEvent('inti-logout', { 
            detail: { success: true, remote: true, loggedOutBy: data?.loggedOutBy } 
          }));
          break;

        case 'auth.logout_error':
          console.error('[IntiComm] ❌ Logout error:', data);
          // Still clear local state even on error
          localStorage.removeItem('inti_auth');
          sessionStorage.removeItem('inti_auth');
          localStorage.removeItem('sessionId');
          sessionStorage.removeItem('sessionId');
          
          setState(prev => ({
            ...prev,
            loading: false,
            user: null,
            authenticated: false,
            error: null
          }));
          
          // Dispatch logout event for other components
          window.dispatchEvent(new CustomEvent('inti-logout', { 
            detail: { success: false, error: data?.error } 
          }));
          break;

        case 'auth.response':
          console.log('[IntiComm] 🔐 Auth response received:', data);
          console.log('[IntiComm] Auth response full object:', JSON.stringify(data, null, 2));
          console.log('[IntiComm] Auth response authenticated:', data?.authenticated);
          console.log('[IntiComm] Auth response user:', data?.user);
          console.log('[IntiComm] Auth response user displayName:', data?.user?.displayName);
          if (data?.authenticated && data?.user && data.user.displayName && data.user.displayName !== 'Replit User') {
            const user: User = {
              id: data.user.id || data.user.userId || 'authenticated_user',
              displayName: data.user.displayName,
              username: data.user.username || data.user.displayName,
              email: data.user.email || null,
              profileImage: extractProfileImage(data.user)
            };

            console.log('[IntiComm] ✅ Successfully authenticated user from auth.response:', user.displayName);
            console.log('[IntiComm] Profile image extracted:', user.profileImage);
            
            const authData = { user, authenticated: true };
            localStorage.setItem('inti_auth', JSON.stringify(authData));
            sessionStorage.setItem('inti_auth', JSON.stringify(authData));

            setState(prev => ({
              ...prev,
              loading: false,
              user,
              authenticated: true,
              error: null
            }));

            if (authCheckTimeoutRef.current) {
              clearTimeout(authCheckTimeoutRef.current);
              authCheckTimeoutRef.current = null;
            }
          } else {
            console.log('[IntiComm] Auth response indicates user not authenticated or invalid data');
            setState(prev => ({
              ...prev,
              loading: false,
              user: null,
              authenticated: false,
              error: null
            }));
          }
          break;

        default:
          console.log('[IntiComm] Unhandled message type:', type);
      }
    } catch (error) {
      console.error('[IntiComm] Error parsing message:', error);
    }
  }, []);

  // Send message via WebSocket
  const sendMessage = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = { type, data, timestamp: Date.now() };
      wsRef.current.send(JSON.stringify(message));
      console.log('[IntiComm] Sent message:', message);
    } else {
      console.warn('[IntiComm] Cannot send message - WebSocket not connected:', { type, data });
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[IntiComm] Already connected');
      return;
    }

    console.log('[IntiComm] Connecting to WebSocket...');
    
    try {
      // Extract session from URL if present and add to WebSocket URL
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session') || urlParams.get('sessionId');
      
      let wsUrl = REPLIT_WS_URL;
      if (sessionId) {
        wsUrl = `${REPLIT_WS_URL}?sessionId=${encodeURIComponent(sessionId)}`;
        console.log('[IntiComm] Connecting with session ID in WebSocket URL');
      }
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      if (sessionId) {
        console.log('[IntiComm] Found session in URL parameter:', sessionId.substring(0, 8) + '...');
      }

      ws.onopen = () => {
        console.log('[IntiComm] WebSocket connected');
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Send authentication request with session if available
        const authMessage: { type: string; timestamp: number; sessionId?: string } = { 
          type: 'auth.check', 
          timestamp: Date.now() 
        };
        
        if (sessionId) {
          authMessage.sessionId = sessionId;
          console.log('[IntiComm] Sending auth check with session ID');
        } else {
          console.log('[IntiComm] Sending auth check without session ID');
        }

        ws.send(JSON.stringify(authMessage));

        // Set timeout for authentication response
        authCheckTimeoutRef.current = setTimeout(() => {
          console.log('[IntiComm] No authentication response received within 10 seconds');
          setState(prev => ({
            ...prev,
            loading: false,
            authenticated: false,
            error: 'Authentication timeout'
          }));
        }, 10000);
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('[IntiComm] WebSocket disconnected:', event.code, event.reason);
        wsRef.current = null;
        
        setState(prev => ({
          ...prev,
          connected: false,
          clientId: null
        }));

        // Reconnect after 3 seconds if not intentionally closed
        if (event.code !== 1000 && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[IntiComm] Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[IntiComm] WebSocket error:', error);
        setState(prev => ({
          ...prev,
          loading: false,
          connected: false,
          error: 'WebSocket connection failed'
        }));
      };

    } catch (error) {
      console.error('[IntiComm] Error creating WebSocket:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        connected: false,
        error: 'Failed to create WebSocket connection'
      }));
    }
  }, [handleMessage]);

  // Check for stored authentication first
  const checkStoredAuth = useCallback(() => {
    console.log('[IntiComm] Checking for stored authentication...');
    
    const storedAuth = localStorage.getItem('inti_auth') || 
                      sessionStorage.getItem('inti_auth');
    
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.user && parsed.authenticated && parsed.user.displayName && parsed.user.displayName !== 'Replit User') {
          console.log('[IntiComm] Found valid stored authentication:', parsed.user.displayName);
          // Also extract profile image from stored auth in case it was saved with the old field name
          if (parsed.user && !parsed.user.profileImage && (parsed.user.profile_image_url || parsed.user.profile_image)) {
            parsed.user.profileImage = extractProfileImage(parsed.user);
            console.log('[IntiComm] Updated stored auth with extracted profile image:', parsed.user.profileImage);
            // Re-save the updated auth data
            localStorage.setItem('inti_auth', JSON.stringify(parsed));
            sessionStorage.setItem('inti_auth', JSON.stringify(parsed));
          }
          setState(prev => ({
            ...prev,
            loading: false,
            user: parsed.user,
            authenticated: true,
            error: null
          }));
          return true;
        } else {
          console.log('[IntiComm] Stored auth is invalid or contains bypass user, clearing...');
          localStorage.removeItem('inti_auth');
          sessionStorage.removeItem('inti_auth');
        }
      } catch {
        console.log('[IntiComm] Invalid stored auth data, clearing...');
        localStorage.removeItem('inti_auth');
        sessionStorage.removeItem('inti_auth');
      }
    }
    
    return false;
  }, []);

  // Send voice transcription
  const sendVoiceTranscription = useCallback((transcription: string, audioData?: unknown) => {
    sendMessage('voice.transcription', { transcription, audioData, timestamp: Date.now() });
  }, [sendMessage]);

  // Logout function
  const logout = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[IntiComm] Sending logout request');
      wsRef.current.send(JSON.stringify({
        type: 'auth.logout',
        clientType: 'PWA',
        timestamp: Date.now()
      }));
    } else {
      console.log('[IntiComm] No active WebSocket connection for logout');
    }
  }, []);

  // Refresh auth function  
  const refreshAuth = useCallback(() => {
    // Clear stored auth and reconnect
    localStorage.removeItem('inti_auth');
    sessionStorage.removeItem('inti_auth');
    setState(prev => ({ ...prev, loading: true, user: null, authenticated: false }));
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  // Initialize connection on mount
  useEffect(() => {
    console.log('[IntiComm] Provider mounted, initializing...');
    
    // First check if we have valid stored auth
    if (!checkStoredAuth()) {
      // If no stored auth, connect to WebSocket
      connect();
    }
    
    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, checkStoredAuth]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!state.connected) return;
    
    const heartbeat = setInterval(() => {
      sendMessage('ping');
    }, 30000);
    
    return () => clearInterval(heartbeat);
  }, [state.connected, sendMessage]);

  return (
    <IntiCommunicationContext.Provider
      value={{
        // State
        ...state,
        
        // Actions
        sendMessage,
        sendVoiceTranscription,
        logout,
        refreshAuth
      }}
    >
      {children}
    </IntiCommunicationContext.Provider>
  );
}

export function useIntiCommunication(): IntiCommunicationContextType {
  const context = useContext(IntiCommunicationContext);
  if (context === undefined) {
    throw new Error('useIntiCommunication must be used within an IntiCommunicationProvider');
  }
  return context;
}

// Alias for backward compatibility
export const useAuth = useIntiCommunication;