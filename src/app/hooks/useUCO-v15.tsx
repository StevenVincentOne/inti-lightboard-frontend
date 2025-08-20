'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
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
    };
  }, [getSessionId]);
  
  // Message handler
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connection.established':
        setConnected(true);
        if (message.userId && !requestSentRef.current) {
          setAuthenticated(true);
          requestSentRef.current = true;
          requestUCOState();
        }
        break;
        
      case 'auth.response':
        if (message.success && message.authenticated) {
          setAuthenticated(true);
          if (!requestSentRef.current) {
            requestSentRef.current = true;
            requestUCOState();
          }
        } else {
          setAuthenticated(false);
          setError('Authentication failed');
          setLoading(false);
        }
        break;
        
      case 'uco.state':
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
        
        console.log('[UCO] v15 data built:', {
          totalFields,
          factsCount: v15Data.data.facts.length,
          markdownLength: v15Data.views.minimal.length
        });
        
        setUCO(v15Data);
        setLoading(false);
        if (onUpdate) onUpdate(v15Data);
        break;
        
      case 'uco.subscription_confirmed':
      case 'uco.subscribed':
        console.log('[UCO] Subscribed');
        break;
        
      case 'uco.conversation_added':
        requestUCOState();
        break;
        
      case 'error':
      case 'uco.error':
        setError(message.data?.message || 'Unknown error');
        setLoading(false);
        break;
    }
  }, [onUpdate, getSessionId]);
  
  // Request UCO state
  const requestUCOState = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const sessionId = getSessionId();
    wsRef.current.send(JSON.stringify({
      type: 'uco.get_state',
      sessionId,
      timestamp: Date.now()
    }));
    
    wsRef.current.send(JSON.stringify({
      type: 'uco.subscribe',
      sessionId,
      timestamp: Date.now()
    }));
  }, [getSessionId]);
  
  // Auto-sync
  useEffect(() => {
    if (autoSync && authenticated && wsRef.current) {
      syncTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          requestUCOState();
        }
      }, syncInterval);
    }
    
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [autoSync, syncInterval, authenticated, requestUCOState]);
  
  // Public methods
  const refresh = useCallback(() => {
    if (authenticated) requestUCOState();
  }, [authenticated, requestUCOState]);
  
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
  
  // Simplified accessors for compatibility
  const user = uco ? {
    id: uco.data.components.user.id || uco.data.metadata.userId,
    name: uco.data.components.user.displayName || uco.data.components.user.display_name || 
          uco.data.components.user.username || 'User',
    bio: uco.data.components.user.bio,
    currentActivity: uco.data.components.user.current_activity || 'active',
    // v15: Access to all raw data
    data: uco.data.components.user
  } : null;
  
  const topic = uco ? {
    loaded: !!uco.data.components.topic.uuid,
    uuid: uco.data.components.topic.uuid || uco.data.components.topic.topic_uuid,
    title: uco.data.components.topic.title || uco.data.components.topic.title_final,
    stage: uco.data.components.topic.status || uco.data.components.topic.stage || 'idle',
    // v15: Access to all raw data
    data: uco.data.components.topic
  } : null;
  
  const conversation = uco ? {
    mode: uco.data.components.conversation.mode || 'text',
    recent: uco.data.components.conversation.messages || 
            uco.data.components.conversation.recent || [],
    // v15: Access to all raw data
    data: uco.data.components.conversation
  } : null;
  
  return {
    // v15 format
    uco,
    
    // State
    loading,
    error,
    connected,
    authenticated,
    
    // Simplified accessors
    user,
    topic, 
    conversation,
    recentMessages: conversation?.recent || [],
    mode: conversation?.mode || 'none',
    
    // Methods
    refresh,
    updateComponent,
    addConversation,
    
    // v15 AI-optimized accessors
    getCanonicalJSON: () => uco?.data,
    getMinimalMarkdown: () => uco?.views.minimal,
    getRetrievalFormat: () => uco?.views.retrieval,
    getFacts: () => uco?.data.facts || [],
    getSummary: () => uco?.views.summary || '',
    
    // Metadata
    metadata: uco?.data.metadata
  };
}