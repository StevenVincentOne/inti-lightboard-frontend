/**
 * React Hook for UCO (Unified Context Object) Integration
 * TensorDock PWA Frontend
 * Version: 1.0.0
 * Created: August 14, 2025
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { UnifiedContextObject, ConversationTurn } from './UCO-interfaces';

interface UseUCOOptions {
  autoSync?: boolean;
  syncInterval?: number;
  onUpdate?: (uco: UnifiedContextObject) => void;
}

export function useUCO(options: UseUCOOptions = {}) {
  const {
    autoSync = true,
    syncInterval = 5000, // 30 seconds
    onUpdate
  } = options;
  
  const [uco, setUCO] = useState<UnifiedContextObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fixed session/auth extraction to match main PWA storage keys
  const getSessionId = useCallback(() => {
    // 1. Check URL parameters first (for fresh redirects from Replit)
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    if (urlSessionId) {
      console.log('[UCO] Found session in URL parameter:', urlSessionId.substring(0, 8) + '...');
      return urlSessionId;
    }
    
    // 2. Check stored auth data and extract session ID (FIXED)
    const storedAuth = localStorage.getItem('inti_auth') || sessionStorage.getItem('inti_auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed.authenticated && parsed.user) {
          console.log('[UCO] Found stored auth data for user:', parsed.user.displayName || parsed.user.username);
          // Generate synthetic session using user data (matches backend expectations)
          if (parsed.user.id) {
            return `user_${parsed.user.id}`;
          } else if (parsed.user.username) {
            return `username_${parsed.user.username}`;
          }
        }
      } catch {
        console.log('[UCO] Invalid stored auth data, clearing...');
        localStorage.removeItem('inti_auth');
        sessionStorage.removeItem('inti_auth');
      }
    }
    
    // 3. Legacy session storage check (fallback)
    const legacySessionId = localStorage.getItem('intellipedia_session') || 
                            sessionStorage.getItem('intellipedia_session');
    if (legacySessionId) {
      console.log('[UCO] Found legacy session');
      return legacySessionId;
    }
    
    console.log('[UCO] No valid session found');
    return null;
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        // Get session ID using the same method as Context Center
        const sessionId = getSessionId();
        
        // Connect to WebSocket (using Replit bridge endpoint)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let websocketUrl = `${protocol}//6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws?clientType=PWA`;
        
        if (sessionId) {
          console.log('[UCO] Connecting with authentication:', sessionId.substring(0, 8) + '...');
          websocketUrl += `&sessionId=${sessionId}`;
        } else {
          console.log('[UCO] Connecting without authentication - UCO features will be limited');
          setError('No authentication found - please log in to use UCO features');
        }
        
        const ws = new WebSocket(websocketUrl);
        
        ws.onopen = () => {
          console.log('[UCO] WebSocket connected');
            // Send immediate state request
          
          // Request initial state
          const stateMsg = {
            type: 'uco.get_state',
            sessionId,
            timestamp: Date.now()
          };
          console.log('[UCO] Sending get_state message:', stateMsg);
          ws.send(JSON.stringify(stateMsg));
          
          // Subscribe to updates
          const subscribeMsg = {
            type: 'uco.subscribe',
            sessionId,
            timestamp: Date.now()
          };
          console.log('[UCO] Sending subscribe message:', subscribeMsg);
          ws.send(JSON.stringify(subscribeMsg));
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('[UCO] Received message:', message);
            handleWebSocketMessage(message);
          } catch (err) {
            console.error('[UCO] Failed to parse message:', err, 'Raw data:', event.data);
          }
        };
        
        ws.onerror = (event) => {
          console.error('[UCO] WebSocket error:', event);
          setError('Connection error');
        };
        
        ws.onclose = () => {
          console.log('[UCO] WebSocket closed');
          // Attempt reconnection after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };
        
        wsRef.current = ws;
      } catch (err) {
        console.error('[UCO] Connection failed:', err);
        setError('Failed to connect');
        setLoading(false);
      }
    };
    
    connectWebSocket();
    
    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [getSessionId]);
  
  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log('[UCO] Processing message type:', message.type);
    
    switch (message.type) {
      case 'uco.state':
        console.log('[UCO] Received state data:', message.data);
        setUCO(message.data);
        setLoading(false);
        if (onUpdate) onUpdate(message.data);
        break;
        
      case 'uco.subscribed':
        console.log('[UCO] Subscription confirmed:', message.data);
        break;
        
      case 'uco.conversation_added':
        console.log('[UCO] Conversation turn added:', message.data);
        // Request fresh state after updates
        if (wsRef.current) {
          const refreshMsg = {
            type: 'uco.get_state',
            timestamp: Date.now()
          };
          console.log('[UCO] Requesting fresh state after conversation update');
          wsRef.current.send(JSON.stringify(refreshMsg));
        }
        break;
        
      case 'uco.event.component_updated':
      case 'uco.event.conversation_turn':
      case 'uco.event.topic_loaded':
        console.log('[UCO] Event received:', message.type);
        // Request fresh state after updates
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'uco.get_state',
            timestamp: Date.now()
          }));
        }
        break;
        
      case 'error':
        console.error('[UCO] Error message:', message.data);
        setError(message.data?.message || 'Unknown error');
        break;
        
      case 'uco.error':
        console.error('[UCO] UCO Error:', message.data);
        setError(message.data?.error || 'UCO error');
        break;
        
      default:
        console.log('[UCO] Unknown message type:', message.type, 'Data:', message.data);
    }
  }, [onUpdate]);
  
  // Set up auto-sync
  useEffect(() => {
    if (autoSync && wsRef.current) {
      syncTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'uco.get_state',
            timestamp: Date.now()
          }));
        }
      }, syncInterval);
    }
    
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [autoSync, syncInterval]);
  
  // Update component
  const updateComponent = useCallback(async (
    component: keyof UnifiedContextObject['components'],
    update: any
  ) => {
    if (!wsRef.current) {
      setError('Not connected');
      return;
    }
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.update_component',
      data: { component, update },
      timestamp: Date.now()
    }));
  }, []);
  
  // Add conversation turn
  const addConversation = useCallback(async (
    content: string,
    type: 'voice' | 'text' = 'text',
    role: 'user' | 'assistant' = 'user',
    metadata?: any
  ) => {
    if (!wsRef.current) {
      console.error('[UCO] Cannot add conversation - not connected');
      setError('Not connected');
      return;
    }
    
    const turn: ConversationTurn = {
      id: Date.now().toString(),
      type,
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    
    const message = {
      type: 'uco.add_conversation',
      data: turn,
      timestamp: Date.now()
    };
    
    console.log('[UCO] Sending add_conversation message:', message);
    wsRef.current.send(JSON.stringify(message));
  }, []);
  
  // Load topic
  const loadTopic = useCallback(async (topicUuid: string, topicData: any) => {
    if (!wsRef.current) {
      setError('Not connected');
      return;
    }
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.load_topic',
      data: { topicUuid, topicData },
      timestamp: Date.now()
    }));
  }, []);
  
  // Get LLM context
  const getLLMContext = useCallback(async (maxTokens?: number) => {
    if (!wsRef.current) {
      setError('Not connected');
      return null;
    }
    
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.type === 'uco.llm_context') {
          wsRef.current?.removeEventListener('message', handler);
          resolve(message.data);
        }
      };
      
      wsRef.current.addEventListener('message', handler);
      
      wsRef.current.send(JSON.stringify({
        type: 'uco.get_llm_context',
        data: { maxTokens },
        timestamp: Date.now()
      }));
    });
  }, []);
  
  // Create snapshot
  const createSnapshot = useCallback(async () => {
    if (!wsRef.current) {
      setError('Not connected');
      return;
    }
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.create_snapshot',
      timestamp: Date.now()
    }));
  }, []);
  
  // Refresh state
  const refresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'uco.get_state',
        timestamp: Date.now()
      }));
    }
  }, []);
  
// Connection status helpers  const isUserConnected = !!(uco?.components?.user?.id);  const isTopicConnected = !!(uco?.components?.topic?.loaded === true || uco?.components?.topic?.draft_uuid || uco?.components?.topic?.title);  const isConversationConnected = !!(uco?.components?.conversation?.active === true || Array.isArray(uco?.components?.conversation?.messages));
  return {
    uco,
    loading,
    error,
    connected: wsRef.current?.readyState === WebSocket.OPEN,
// Connection status for components    isUserConnected,    isTopicConnected,    isConversationConnected,
    
    // Actions
    updateComponent,
    addConversation,
    loadTopic,
    getLLMContext,
    createSnapshot,
    refresh,
    
    // Convenience getters
    user: uco?.components?.user,
    topic: uco?.components?.topic,
    conversation: uco?.components?.conversation,
    recentMessages: uco?.components?.conversation?.recent || [],
    mode: uco?.components?.conversation?.mode,
    activeGraph: uco?.activeGraph
  };
}