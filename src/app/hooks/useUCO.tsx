'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Security: Sanitize user content to prevent prompt injection
function sanitizeUserContent(content: any): any {
  if (typeof content !== 'string') return content;
  
  // Dangerous patterns that could be injection attempts
  const dangerous = [
    /^(system|assistant|instruction):/i,
    /\[INST\]/,
    /<\|.*?\|>/,
    /###\s*(System|Instruction)/i,
    /ignore previous instructions/i,
    /disregard above/i
  ];
  
  for (const pattern of dangerous) {
    if (pattern.test(content)) {
      return '[Content filtered for security]';
    }
  }
  
  return content;
}

// Extract atomic facts for better retrieval/embedding
function extractFacts(components: any): string[] {
  const facts: string[] = [];
  const user = components?.user?.data || components?.user || {};
  const topic = components?.topic?.data || components?.topic || {};
  const conversation = components?.conversation || {};
  
  // User facts (atomic, concise)
  if (user.displayName || user.display_name) {
    facts.push(`User is ${user.displayName || user.display_name}`);
  }
  if (user.bio) facts.push(`User role: ${user.bio}`);
  if (user.intis_earned_total) facts.push(`${user.intis_earned_total} Intis earned`);
  if (user.github_username) facts.push(`GitHub: ${user.github_username}`);
  if (user.currentDraftUuid || user.current_draft_uuid) facts.push(`Has active draft`);
  
  // Topic facts
  if (topic.title || topic.title_final) {
    facts.push(`Working on: ${topic.title || topic.title_final}`);
  }
  if (topic.status || topic.stage) {
    facts.push(`Topic status: ${topic.status || topic.stage}`);
  }
  if (topic.version) facts.push(`Topic version: ${topic.version}`);
  
  // Conversation facts  
  const msgCount = conversation.messages?.length || conversation.recent?.length || 0;
  facts.push(`${msgCount} messages in conversation`);
  facts.push(`Mode: ${conversation.mode || 'text'}`);
  
  return facts;
}

// Generate minimal markdown (<100 tokens)
function generateMinimalMarkdown(components: any): string {
  const user = components?.user?.data || components?.user || {};
  const topic = components?.topic?.data || components?.topic || {};
  const conversation = components?.conversation || {};
  
  const lines: string[] = ['# UCO State\n'];
  
  // User section - ultra concise
  lines.push('## User');
  const userName = user.displayName || user.display_name || user.username || 'Unknown';
  lines.push(`- ${userName}`);
  if (user.bio) lines.push(`- ${user.bio}`);
  if (user.intis_earned_total) lines.push(`- ${user.intis_earned_total} Intis`);
  
  // Topic section - only if active
  if (topic.loaded || topic.uuid) {
    lines.push('\n## Topic');
    lines.push(`- ${topic.title || topic.title_final || 'Untitled'}`);
    lines.push(`- ${topic.status || topic.stage || 'idle'}`);
  }
  
  // State - bare minimum
  lines.push('\n## State');
  const msgCount = conversation.messages?.length || conversation.recent?.length || 0;
  lines.push(`- Messages: ${msgCount}`);
  lines.push(`- Mode: ${conversation.mode || 'text'}`);
  
  return lines.join('\n');
}

// Generate retrieval-optimized format
function generateRetrievalFormat(uco: any): string {
  const user = uco?.components?.user;
  const topic = uco?.components?.topic;
  const conversation = uco?.components?.conversation;
  
  // Section 1: Quick context (for embeddings)
  let retrieval = '## Context\n';
  retrieval += `- User: ${user?.name || 'Unknown'}`;
  if (user?.bio) retrieval += ` (${user.bio})`;
  retrieval += '\n';
  
  if (topic?.loaded) {
    retrieval += `- Topic: ${topic.title || 'Untitled'} [${topic.stage}]\n`;
  }
  
  const msgCount = conversation?.recent?.length || 0;
  retrieval += `- Chat: ${msgCount > 0 ? `${msgCount} msgs` : 'None'}\n`;
  
  // Section 2: Fenced JSON with key fields only
  const keyData = {
    userId: user?.id,
    topicId: topic?.uuid,
    messages: msgCount,
    mode: conversation?.mode
  };
  
  retrieval += '\n```json\n' + JSON.stringify(keyData, null, 2) + '\n```';
  
  return retrieval;
}

// v15 UCO Interface - Optimized for AI
interface UCOv15 {
  // Canonical JSON data
  data: {
    type: 'uco.state';
    version: 'v15';
    timestamp: number;
    components: {
      user: any;        // ALL raw fields preserved
      topic: any;       // ALL raw fields preserved  
      conversation: any; // ALL raw fields preserved
    };
    metadata: {
      userId: number;
      sessionId?: string;
      subscriptions: string[];
      privacy: 'private' | 'public';
      confidence: number;
      totalFields: number;
    };
    facts: string[];     // Atomic facts for retrieval
    instructions: never[]; // Type-safe: no instructions mixed with content
  };
  
  // Generated views (not stored)
  views: {
    minimal: string;     // <100 tokens markdown
    retrieval: string;   // Optimized for RAG
    summary: string;     // One-line summary
  };
}

// Simplified external interface
interface UnifiedContextObject {
  components: {
    user?: {
      id: number;
      name: string;
      bio?: string;
      currentActivity?: string;
    };
    topic?: {
      loaded: boolean;
      uuid: string | null;
      title: string | null;
      stage: string;
    };
    conversation?: {
      mode: 'voice' | 'text' | 'mixed';
      recent: Array<any>;
    };
  };
  context?: string;
  mode?: string;
}

interface UCOHookOptions {
  autoSync?: boolean;
  syncInterval?: number;
  onUpdate?: (uco: UCOv15) => void;
}

export function useUCO(options: UCOHookOptions = {}) {
  const { 
    autoSync = false, 
    syncInterval = 30000,
    onUpdate
  } = options;
  
  // State - now storing v15 format
  const [uco, setUCO] = useState<UCOv15 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const syncTimerRef = useRef<NodeJS.Timer | null>(null);
  const requestSentRef = useRef<boolean>(false);
  const subscribedRef = useRef<boolean>(false);
  const lastUpdateRef = useRef<number>(0);
  const updateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const currentUCORef = useRef<UCOv15 | null>(null); // Store current UCO state for immediate access
  
  // Get session ID
  const getSessionId = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSession = urlParams.get('session') || urlParams.get('sessionId');
    
    if (urlSession) {
      console.log('[UCO] Session from URL:', urlSession.substring(0, 8) + '...');
      return urlSession;
    }
    
    const authData = localStorage.getItem('auth');
    if (authData) {
      try {
        const auth = JSON.parse(authData);
        if (auth.sessionId) {
          console.log('[UCO] Session from storage:', auth.sessionId.substring(0, 8) + '...');
          return auth.sessionId;
        }
      } catch (e) {
        console.error('[UCO] Auth parse error:', e);
      }
    }
    
    return null;
  }, []);
  
  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const sessionId = getSessionId();
      
      if (!sessionId) {
        setError('No authentication session');
        setLoading(false);
        return;
      }
      
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                      (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
                        ? 'ws://localhost:5000/api/inti-ws'
                        : 'wss://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/api/inti-ws');
        
        const ws = new WebSocket(`${wsUrl}?sessionId=${encodeURIComponent(sessionId)}&clientType=PWA`);
        
        ws.onopen = () => {
          console.log('[UCO] Connected');
          setConnected(true);
          setError(null);
          requestSentRef.current = false;
          subscribedRef.current = false;
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // Only log non-ping messages
            if (message.type !== 'ping' && message.type !== 'pong') {
              console.log('[UCO] Message received:', message.type, new Date().toISOString());
            }
            handleWebSocketMessage(message);
          } catch (err) {
            console.error('[UCO] Parse error:', err);
          }
        };
        
        ws.onerror = (event) => {
          console.error('[UCO] WS error:', event);
          setError('Connection error');
        };
        
        ws.onclose = () => {
          console.log('[UCO] Disconnected');
          setConnected(false);
          setAuthenticated(false);
          requestSentRef.current = false;
          subscribedRef.current = false;
          setTimeout(connectWebSocket, 5000);
        };
        
        wsRef.current = ws;
      } catch (err) {
        console.error('[UCO] Connect failed:', err);
        setError('Failed to connect');
        setLoading(false);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (updateDebounceRef.current) clearTimeout(updateDebounceRef.current);
    };
  }, [getSessionId]);
  
  // Message handler
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connection.established':
        setConnected(true);
        if (message.userId) {
          setAuthenticated(true);
          if (!requestSentRef.current) {
            requestSentRef.current = true;
            requestInitialState();
          }
          if (!subscribedRef.current) {
            subscribeToUpdates();
          }
        }
        break;
        
      case 'auth.response':
        if (message.success && message.authenticated) {
          setAuthenticated(true);
          if (!requestSentRef.current) {
            requestSentRef.current = true;
            requestInitialState();
          }
          if (!subscribedRef.current) {
            subscribeToUpdates();
          }
        } else {
          setAuthenticated(false);
          setError('Authentication failed');
          setLoading(false);
        }
        break;
        
      case 'uco.state':
        // Debounce rapid updates
        const now = Date.now();
        if (now - lastUpdateRef.current < 100) {
          console.log('[UCO] Debouncing rapid update (within 100ms)');
          
          // Clear existing debounce timer
          if (updateDebounceRef.current) {
            clearTimeout(updateDebounceRef.current);
          }
          
          // Set new debounce timer
          updateDebounceRef.current = setTimeout(() => {
            handleWebSocketMessage(message);
            updateDebounceRef.current = null;
          }, 100);
          return;
        }
        lastUpdateRef.current = now;
        
        console.log('[UCO] Processing state update at', new Date().toISOString());
        // Extract and sanitize raw data
        const rawUser = message.data?.components?.user?.data || {};
        const rawTopic = message.data?.components?.topic?.data || {};
        const rawConversation = message.data?.components?.conversation || {};
        
        // Sanitize user-generated content
        if (rawUser.bio) rawUser.bio = sanitizeUserContent(rawUser.bio);
        if (rawTopic.title) rawTopic.title = sanitizeUserContent(rawTopic.title);
        if (rawTopic.content) rawTopic.content = sanitizeUserContent(rawTopic.content);
        
        // Count total fields
        const totalFields = Object.keys(rawUser).length + 
                          Object.keys(rawTopic).length + 
                          Object.keys(rawConversation).length;
        
        // Build v15 structure
        const v15Data: UCOv15 = {
          data: {
            type: 'uco.state',
            version: 'v15',
            timestamp: Date.now(),
            components: {
              user: rawUser,
              topic: rawTopic,
              conversation: rawConversation
            },
            metadata: {
              userId: rawUser.id || message.data?.metadata?.userId || 0,
              sessionId: getSessionId() || undefined,
              subscriptions: message.data?.metadata?.subscription ? 
                Object.keys(message.data.metadata.subscription) : [],
              privacy: 'private',
              confidence: 0.95,
              totalFields
            },
            facts: extractFacts(message.data?.components),
            instructions: [] // Always empty for safety
          },
          views: {
            minimal: generateMinimalMarkdown(message.data?.components),
            retrieval: generateRetrievalFormat(message.data?.components),
            summary: `${rawUser.displayName || 'User'} | ${rawTopic.title || 'No topic'} | ${rawConversation.messages?.length || 0} msgs`
          }
        };
        
        // Enhanced logging with field breakdown
        const fieldBreakdown = {
          user: Object.keys(rawUser).filter(k => rawUser[k] !== null && rawUser[k] !== undefined),
          topic: Object.keys(rawTopic).filter(k => rawTopic[k] !== null && rawTopic[k] !== undefined),
          conversation: Object.keys(rawConversation).filter(k => rawConversation[k] !== null && rawConversation[k] !== undefined)
        };
        
        console.log('[UCO] State received:', {
          totalFields,
          factsCount: v15Data.data.facts.length,
          markdownLength: v15Data.views.minimal.length,
          timestamp: new Date().toISOString(),
          fieldBreakdown: {
            userFields: `${fieldBreakdown.user.length} populated (${fieldBreakdown.user.slice(0, 5).join(', ')}${fieldBreakdown.user.length > 5 ? '...' : ''})`,
            topicFields: `${fieldBreakdown.topic.length} populated (${fieldBreakdown.topic.slice(0, 5).join(', ')}${fieldBreakdown.topic.length > 5 ? '...' : ''})`,
            conversationFields: `${fieldBreakdown.conversation.length} populated (${fieldBreakdown.conversation.slice(0, 3).join(', ')})`
          }
        });
        
        // Log sample data for debugging
        if (rawUser.id) {
          console.log('[UCO] User data sample:', {
            id: rawUser.id,
            name: rawUser.displayName || rawUser.display_name,
            bio: rawUser.bio,
            intis: rawUser.intis_earned_total,
            github: rawUser.github_username
          });
        }
        
        if (rawTopic.uuid || rawTopic.topic_uuid || rawTopic.title) {
          console.log('[UCO] Topic data sample:', {
            uuid: rawTopic.uuid || rawTopic.topic_uuid,
            title: rawTopic.title || rawTopic.title_final,
            status: rawTopic.status || rawTopic.stage,
            version: rawTopic.version
          });
        }
        
        setUCO(v15Data);
        currentUCORef.current = v15Data; // Update ref immediately for field updates
        setLoading(false);
        console.log('[UCO] State set successfully - should be available for field updates');
        if (onUpdate) onUpdate(v15Data);
        break;
        
      case 'uco.subscription_confirmed':
      case 'uco.subscribed':
        console.log('[UCO] Subscription confirmed by backend');
        subscribedRef.current = true;
        break;
        
      case 'uco.conversation_added':
        // Don't request full state, backend should send update
        console.log('[UCO] Conversation added, waiting for update');
        break;
        
      case 'uco.field_update':
        // Handle partial field updates from backend
        console.log('[UCO] Field update received:', message.component, message.updates);
        console.log('[UCO] React state UCO:', uco ? 'EXISTS' : 'NULL');
        console.log('[UCO] Ref UCO state:', currentUCORef.current ? 'EXISTS' : 'NULL');
        console.log('[UCO] Message structure:', { type: message.type, component: message.component, hasUpdates: !!message.updates });
        
        // Use ref for immediate access, fallback to state
        const currentUCO = currentUCORef.current || uco;
        
        // If neither ref nor state has UCO, request initial state and try again
        if (!currentUCO && message.component && message.updates) {
          console.log('[UCO] No UCO state available, requesting initial state and retrying field update');
          requestInitialState();
          
          // Retry the field update after a short delay to allow state to initialize
          setTimeout(() => {
            console.log('[UCO] Retrying field update after state initialization');
            handleWebSocketMessage(message);
          }, 100);
          return;
        }
        
        if (currentUCO && message.component && message.updates) {
          console.log('[UCO] Processing field update for component:', message.component);
          console.log('[UCO] Update data:', message.updates);
          
          // Create a proper deep copy to ensure React detects state changes
          const updatedUCO = {
            ...currentUCO,
            data: {
              ...currentUCO.data,
              components: {
                ...currentUCO.data.components
              }
            },
            views: { ...currentUCO.views }
          };
          
          // Merge the updates into the appropriate component
          if (message.component === 'user') {
            updatedUCO.data.components.user = {
              ...updatedUCO.data.components.user,
              ...message.updates
            };
          } else if (message.component === 'topic') {
            updatedUCO.data.components.topic = {
              ...updatedUCO.data.components.topic,
              ...message.updates
            };
          } else if (message.component === 'conversation') {
            updatedUCO.data.components.conversation = {
              ...updatedUCO.data.components.conversation,
              ...message.updates
            };
          }
          
          // Update timestamp
          updatedUCO.data.timestamp = Date.now();
          
          // Regenerate views
          updatedUCO.views = {
            minimal: generateMinimalMarkdown(updatedUCO.data.components),
            retrieval: generateRetrievalFormat(updatedUCO.data.components),
            summary: `${updatedUCO.data.components.user.displayName || 'User'} | ${updatedUCO.data.components.topic.title || 'No topic'} | ${updatedUCO.data.components.conversation.messages?.length || 0} msgs`
          };
          
          // Update facts if needed
          updatedUCO.data.facts = extractFacts(updatedUCO.data.components);
          
          console.log('[UCO] Applied field update to', message.component);
          console.log('[UCO] Updated topic component:', updatedUCO.data.components.topic);
          console.log('[UCO] Topic loaded status should be:', !!updatedUCO.data.components.topic.loaded || !!updatedUCO.data.components.topic.uuid);
          
          setUCO(updatedUCO);
          currentUCORef.current = updatedUCO; // Update ref immediately for subsequent field updates
          
          if (onUpdate) onUpdate(updatedUCO);
        }
        break;
        
      case 'error':
      case 'uco.error':
        setError(message.data?.message || 'Unknown error');
        setLoading(false);
        break;
    }
  }, [onUpdate, getSessionId]);
  
  // Request initial UCO state (once)
  const requestInitialState = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const sessionId = getSessionId();
    const timestamp = new Date().toISOString();
    console.log('[UCO] Requesting initial state at', timestamp);
    wsRef.current.send(JSON.stringify({
      type: 'uco.get_state',
      sessionId,
      timestamp: Date.now()
    }));
  }, [getSessionId]);
  
  // Subscribe to updates (once)
  const subscribeToUpdates = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (subscribedRef.current) {
      console.log('[UCO] Already subscribed, skipping');
      return;
    }
    
    const sessionId = getSessionId();
    console.log('[UCO] Subscribing to updates');
    wsRef.current.send(JSON.stringify({
      type: 'uco.subscribe',
      sessionId,
      timestamp: Date.now()
    }));
    // Mark as subscribed AFTER sending the message
    subscribedRef.current = true;
  }, [getSessionId]);
  
  // Auto-sync (disabled by default for event-driven updates)
  useEffect(() => {
    if (autoSync && authenticated && wsRef.current) {
      console.log('[UCO] Auto-sync enabled with interval:', syncInterval);
      syncTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          requestInitialState();
        }
      }, syncInterval);
    }
    
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [autoSync, syncInterval, authenticated, requestInitialState]);
  
  // Public methods
  const refresh = useCallback(() => {
    if (authenticated) {
      console.log('[UCO] Manual refresh requested');
      requestInitialState();
    }
  }, [authenticated, requestInitialState]);
  
  const updateComponent = useCallback((component: string, update: any) => {
    if (!wsRef.current || !authenticated) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.update_component',
      data: { component, update },
      timestamp: Date.now()
    }));
  }, [authenticated]);
  
  const addConversation = useCallback((content: string, type = 'text', role = 'user') => {
    if (!wsRef.current || !authenticated) return;
    
    // Sanitize user content before sending
    const sanitized = sanitizeUserContent(content);
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.add_conversation',
      data: { content: sanitized, type, role },
      timestamp: Date.now()
    }));
  }, [authenticated]);
  
  // Memoized accessors to prevent effect loops
  const user = useMemo(() => {
    if (!uco) return null;
    return {
      id: uco.data.components.user.id || uco.data.metadata.userId,
      name: uco.data.components.user.displayName || uco.data.components.user.display_name || 
            uco.data.components.user.username || 'User',
      bio: uco.data.components.user.bio,
      currentActivity: uco.data.components.user.current_activity || 'active',
      // v15: Access to all raw data
      data: uco.data.components.user
    };
  }, [uco]);
  
  const topic = useMemo(() => {
    if (!uco) return null;
    const topicData = uco.data.components.topic;
    const hasUuid = !!(topicData.uuid || topicData.topic_uuid);
    const hasTitle = !!(topicData.title || topicData.title_final || topicData.title_contributor);
    
    return {
      loaded: hasUuid || hasTitle,  // Consider loaded if has UUID or title
      uuid: topicData.uuid || topicData.topic_uuid,
      title: topicData.title || topicData.title_final || topicData.title_contributor,
      stage: topicData.status || topicData.stage || 'idle',
      // v15: Access to all raw data
      data: topicData
    };
  }, [uco]);
  
  const conversation = useMemo(() => {
    if (!uco) return null;
    return {
      mode: uco.data.components.conversation.mode || 'text',
      recent: uco.data.components.conversation.messages || 
              uco.data.components.conversation.recent || [],
      // v15: Access to all raw data
      data: uco.data.components.conversation
    };
  }, [uco]);
  
  const recentMessages = useMemo(() => {
    return conversation?.recent || [];
  }, [conversation]);
  
  const mode = useMemo(() => {
    return conversation?.mode || 'none';
  }, [conversation]);
  
  return {
    // v15 format
    uco,
    
    // State
    loading,
    error,
    connected,
    authenticated,
    
    // Simplified accessors (memoized)
    user,
    topic, 
    conversation,
    recentMessages,
    mode,
    
    // Methods
    refresh,
    updateComponent,
    addConversation,
    
    // v15 AI-optimized accessors (memoized)
    getCanonicalJSON: useCallback(() => uco?.data, [uco]),
    getMinimalMarkdown: useCallback(() => uco?.views.minimal, [uco]),
    getRetrievalFormat: useCallback(() => uco?.views.retrieval, [uco]),
    getFacts: useCallback(() => uco?.data.facts || [], [uco]),
    getSummary: useCallback(() => uco?.views.summary || '', [uco]),
    
    // Metadata
    metadata: uco?.data.metadata
  };
}