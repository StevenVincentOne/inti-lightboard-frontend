// Combined Inti Communication and Authentication Provider
// FIXED: Always connects to WebSocket even with stored auth
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
const extractProfileImage = (userData: any): string | null => {
  // Handle multiple possible field names from the backend
  return userData.profileImage || userData.profile_image_url || userData.profile_image || null;
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
  const authCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle authentication success
  const handleAuthenticationSuccess = useCallback((userData: any) => {
    console.log('[IntiComm] handleAuthenticationSuccess called with:', userData);
    
    if (userData && userData.displayName && userData.displayName !== 'Replit User') {
      const user: User = {
        id: userData.id || userData.userId || 'authenticated_user',
        displayName: userData.displayName,
        username: userData.username || userData.displayName,
        email: userData.email || null,
        profileImage: extractProfileImage(userData)
      };

      console.log('[IntiComm] ✅ Successfully authenticated user via handleAuthenticationSuccess:', user.displayName);
      
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
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      const { type, data } = message;

      // Store clientId if provided
      if (message.clientId) {
        setState(prev => ({ ...prev, clientId: message.clientId }));
      }

      switch (type) {
        case 'connection_established':
        case 'connection.established':
          console.log('[IntiComm] ✅ Connection established:', data);
          
          // Check if we have authentication info  
          if (data?.authenticated && data?.user && data.user.displayName && data.user.displayName !== 'Replit User') {
            const user: User = {
              id: data.user.id || data.user.userId || 'authenticated_user',
              displayName: data.user.displayName,
              username: data.user.username || data.user.displayName,
              email: data.user.email || null,
              profileImage: extractProfileImage(data.user)
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
              connected: true,
              clientId: data?.clientId || data?.connectionId || prev.clientId,
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

        case 'connected':
          console.log('[IntiComm] ✅ Connection established:', message);
          setState(prev => ({ 
            ...prev, 
            connected: true,
            loading: false,
            clientId: data?.clientId || prev.clientId
          }));
          if (data?.user) {
            handleAuthenticationSuccess(data.user);
          }
          break;

        default:
          console.log('[IntiComm] Unhandled message type:', type);
      }
    } catch (error) {
      console.error('[IntiComm] Error parsing message:', error);
    }
  }, [handleAuthenticationSuccess]);

  // Send message via WebSocket - FIXED to include clientId
  const sendMessage = useCallback((type: string, data?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Updated to match Replit Agent's expected format
      const message = { 
        type, 
        clientId: state.clientId || 'unknown',
        data: data || {}, 
        timestamp: Date.now() 
      };
      wsRef.current.send(JSON.stringify(message));
      console.log('[IntiComm] Sent message:', message);
    } else {
      console.warn('[IntiComm] Cannot send message - WebSocket not connected:', { type, data });
    }
  }, [state.clientId]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[IntiComm] Already connected');
      return;
    }

    console.log('[IntiComm] Connecting to WebSocket...');

    // Get session ID from various sources
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromUrl = urlParams.get('session');
    const storedAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
    let sessionId = sessionFromUrl;

    // Try to extract session from stored auth
    if (!sessionId && storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        sessionId = parsed.sessionId || (parsed.user?.id ? `user_${parsed.user.id}` : null);
      } catch {}
    }

    // CRITICAL: Extract session cookie for WebSocket authentication
    if (!sessionId) {
      // Look for connect.sid cookie (Express session cookie)
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('connect.sid='));
      if (sessionCookie) {
        sessionId = sessionCookie.split('=')[1];
        console.log('[IntiComm] Found session cookie for WebSocket authentication');
      }
    }

    // Fallback to legacy session storage
    if (!sessionId) {
      sessionId = localStorage.getItem('intellipedia_session') || 
                  sessionStorage.getItem('sessionId') ||
                  document.cookie.split(';').find(c => c.trim().startsWith('sessionId='))?.split('=')[1];
    }

    const wsUrl = sessionId 
      ? `${REPLIT_WS_URL}?clientType=PWA&sessionId=${sessionId}`
      : `${REPLIT_WS_URL}?clientType=PWA`;

    console.log('[IntiComm] WebSocket URL:', wsUrl.replace(/sessionId=[^&]+/, 'sessionId=[REDACTED]'));

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[IntiComm] ✅ WebSocket connected successfully');
        setState(prev => ({ ...prev, connected: true }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('[IntiComm] WebSocket closed:', event.code, event.reason);
        setState(prev => ({
          ...prev,
          connected: false,
          clientId: null,
          error: event.reason || 'Connection closed'
        }));
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds if not intentionally closed
        if (event.code !== 1000) {
          setTimeout(() => {
            console.log('[IntiComm] Attempting to reconnect...');
            connect();
          }, 5000);
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

  // Initialize connection on mount - FIXED: Always connect for real-time features
  useEffect(() => {
    console.log('[IntiComm] Provider mounted, initializing...');
    
    // Check for stored auth to set initial state
    checkStoredAuth();
    
    // ALWAYS connect to WebSocket for real-time features (chat, updates, etc.)
    console.log('[IntiComm] Establishing WebSocket connection for real-time features...');
    connect();

    // Cleanup on unmount
    return () => {
      console.log('[IntiComm] Provider unmounting, cleaning up...');
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []); // Empty deps to run only on mount

  const contextValue: IntiCommunicationContextType = {
    ...state,
    sendMessage,
    sendVoiceTranscription,
    logout,
    refreshAuth
  };

  return (
    <IntiCommunicationContext.Provider value={contextValue}>
      {children}
    </IntiCommunicationContext.Provider>
  );
}

export function useIntiCommunication() {
  const context = useContext(IntiCommunicationContext);
  if (!context) {
    throw new Error('useIntiCommunication must be used within IntiCommunicationProvider');
  }
  return context;
}

// Alias for backward compatibility with components expecting useAuth
export const useAuth = useIntiCommunication;