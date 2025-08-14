// Text Chat Interface Component - WebSocket Bridge Integration
// File: /frontend/src/app/components/IntiTextChat.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';

interface ChatMessage {
  id: number;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  response_time_ms?: number;
}

interface IntiTextChatProps {
  isVisible: boolean;
  onClose: () => void;
  // Optional topic context
  topicUuid?: string;
}

export const IntiTextChat: React.FC<IntiTextChatProps> = ({
  isVisible,
  onClose,
  topicUuid
}) => {
  const { 
    isConnected, 
    sendMessage, 
    authState 
  } = useIntiCommunication();
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  // Start chat session when component becomes visible
  useEffect(() => {
    if (isVisible && isConnected && !sessionStarted) {
      startChatSession();
    }
  }, [isVisible, isConnected, sessionStarted]);

  // Handle incoming WebSocket messages
  useEffect(() => {
  const handleChatMessage = (event: CustomEvent) => {
    const message = event.detail;
    
    switch (message.type) {
      case 'chat.session_started':
        handleSessionStarted(message.data);
        break;
        
      case 'chat.message_received':
        handleMessageReceived(message.data);
        break;
        
      case 'chat.history_loaded':
        handleHistoryLoaded(message.data);
        break;
        
      case 'chat.session_ended':
        handleSessionEnded(message.data);
        break;
        
      case 'error':
        if (message.data.message?.includes('chat')) {
          setConnectionError(message.data.message);
          setIsLoading(false);
        }
        break;
    }
  };

  window.addEventListener('intiChatMessage', handleChatMessage);
  
  return () => {
    window.removeEventListener('intiChatMessage', handleChatMessage);
  };
}, []);

  // Start a new chat session
  const startChatSession = useCallback(() => {
    if (!isConnected) {
      setConnectionError('Not connected to server');
      return;
    }

    console.log('Starting chat session with topic:', topicUuid || authState.user?.uuid);
    
    sendMessage({
      type: 'chat.start_session',
      data: {
        topic_uuid: topicUuid || authState.user?.uuid || null
      }
    });
    
    setSessionStarted(true);
  }, [isConnected, sendMessage, topicUuid, authState.user]);

  // Handle session started response
  const handleSessionStarted = useCallback((data: unknown) => {
    if (data.success) {
      setSessionId(data.session_id);
      setConnectionError(null);
      
      console.log('Chat session started:', {
        sessionId: data.session_id,
        topicUuid: data.topic_uuid,
        topicTitle: data.topic_title,
        userName: data.user_name,
        contextInjected: data.context_injected
      });
      
      // Show initial context message if context was injected
      if (data.context_injected && data.topic_title) {
        const contextMessage: ChatMessage = {
          id: 0,
          type: 'assistant',
          content: `Hi ${data.user_name || 'there'}! I see you're working on "${data.topic_title}". How can I help you with this topic today?`,
          timestamp: new Date().toISOString()
        };
        setChatHistory([contextMessage]);
      }
    } else {
      setConnectionError('Failed to start chat session');
    }
  }, []);

  // Handle message received response
  const handleMessageReceived = useCallback((data: unknown) => {
    if (data.success) {
      const userMessage: ChatMessage = {
        id: data.user_message.id,
        type: 'user',
        content: data.user_message.content,
        timestamp: data.user_message.timestamp
      };
      
      const assistantMessage: ChatMessage = {
        id: data.assistant_message.id,
        type: 'assistant',
        content: data.assistant_message.content,
        timestamp: data.assistant_message.timestamp,
        model: data.assistant_message.model,
        response_time_ms: data.assistant_message.response_time_ms
      };
      
      setChatHistory(prev => [...prev, userMessage, assistantMessage]);
      setIsLoading(false);
      setConnectionError(null);
      
      console.log('Message processed:', {
        responseTime: data.assistant_message.response_time_ms,
        model: data.assistant_message.model,
        tokenCount: data.assistant_message.token_count
      });
    } else {
      setConnectionError('Failed to process message');
      setIsLoading(false);
    }
  }, []);

  // Handle chat history loaded
  const handleHistoryLoaded = useCallback((data: unknown) => {
    if (data.success && data.messages) {
      const messages: ChatMessage[] = data.messages.map((msg: {id: number; message_type: string; content: string; created_at: string; llm_model?: string; llm_response_time_ms?: number}) => ({
        id: msg.id,
        type: msg.message_type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.created_at,
        model: msg.llm_model,
        response_time_ms: msg.llm_response_time_ms
      }));
      
      setChatHistory(messages);
      console.log(`Loaded ${messages.length} previous messages`);
    }
  }, []);

  // Handle session ended
  const handleSessionEnded = useCallback((data: unknown) => {
    if (data.success) {
      setSessionId(null);
      setSessionStarted(false);
      console.log('Chat session ended');
    }
  }, []);

  // Send message via WebSocket
  const sendChatMessage = useCallback(async () => {
    if (!inputText.trim() || isLoading || !sessionId) return;

    const messageContent = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setConnectionError(null);

    console.log('Sending message via WebSocket:', messageContent);

    sendMessage({
      type: 'chat.send_message',
      data: {
        session_id: sessionId,
        content: messageContent,
        topic_uuid: topicUuid || authState.user?.uuid || null
      }
    });
  }, [inputText, isLoading, sessionId, sendMessage, topicUuid, authState.user]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  }, [sendChatMessage]);

  // Copy message content
  const copyToClipboard = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, []);

  // End chat session
  const endSession = useCallback(() => {
    if (sessionId) {
      sendMessage({
        type: 'chat.end_session',
        data: { session_id: sessionId }
      });
    }
  }, [sessionId, sendMessage]);

  // Clean up session when component unmounts
  useEffect(() => {
    return () => {
      if (sessionId) {
        endSession();
      }
    };
  }, [sessionId, endSession]);

  if (!isVisible) return null;

  return (
    <div className="fixed left-0 top-0 h-full w-96 bg-black/95 backdrop-blur-sm border-r border-white/10 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-xl">💬</span>
          <h2 className="text-white text-lg font-semibold">Chat with Inti</h2>
          {authState.user && (
            <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded">
              {authState.user.title}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors text-xl"
        >
          ✕
        </button>
      </div>

      {/* Connection Status */}
      <div className="p-3 bg-gray-900/50 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm">
          {isConnected && sessionId ? (
            <>
              <span>🟢</span>
              <span className="text-green-400">Connected - Session Active</span>
              {user && (
                <span className="text-white/60">as {user.displayName}</span>
              )}
            </>
          ) : isConnected ? (
            <>
              <span>🟡</span>
              <span className="text-yellow-400">Starting Session...</span>
            </>
          ) : (
            <>
              <span>🔴</span>
              <span className="text-red-400">Disconnected</span>
            </>
          )}
        </div>
        
        {connectionError && (
          <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded">
            {connectionError}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((message) => (
          <div
            key={`${message.type}-${message.id}`}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg relative group ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-white'
              }`}
            >
              <div className="text-sm">{message.content}</div>
              
              {/* Message metadata */}
              <div className="flex items-center gap-2 mt-2 text-xs opacity-60">
                <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                {message.model && (
                  <span>• {message.model.split('/')[1]}</span>
                )}
                {message.response_time_ms && (
                  <span>• {message.response_time_ms}ms</span>
                )}
              </div>
              
              {/* Copy button */}
              <button
                onClick={() => copyToClipboard(message.content)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-white/60 hover:text-white text-xs"
                title="Copy message"
              >
                📋
              </button>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-white p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                <span className="text-sm text-white/60 ml-2">Inti is thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sessionId ? "Type your message... (Enter to send, Shift+Enter for new line)" : "Starting session..."}
            disabled={!sessionId || isLoading}
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 min-h-[40px] max-h-[120px] resize-none border border-white/10 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            rows={1}
          />
          <button
            onClick={sendChatMessage}
            disabled={!inputText.trim() || isLoading || !sessionId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '⏳' : '➤'}
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-white/40">
          <span>
            {sessionId ? `Session: ${sessionId.slice(-8)}` : 'No active session'}
          </span>
          {sessionId && (
            <button
              onClick={endSession}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              End Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntiTextChat;