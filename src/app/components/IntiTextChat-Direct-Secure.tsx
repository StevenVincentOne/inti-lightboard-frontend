"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface IntiTextChatDirectSecureProps {
  isVisible: boolean;
  onClose: () => void;
  topicUuid?: string;
}

export default function IntiTextChatDirectSecure({ 
  isVisible,
  topicUuid, 
  onClose
}: IntiTextChatDirectSecureProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState({ text: 'Ready', color: 'bg-green-400' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef<string>('');
  const currentResponseIdRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get session ID from localStorage or generate one
  const getSessionId = () => {
    let sessionId = localStorage.getItem('inti_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('inti_session_id', sessionId);
    }
    return sessionId;
  };

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize welcome message
  useEffect(() => {
    if (isVisible && messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello! I'm Inti, your AI assistant. ${topicUuid ? `I can see we're discussing topic ${topicUuid}.` : 'What would you like to talk about?'}`,
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
    }
  }, [isVisible, topicUuid, messages.length]);

  // Test secure API connection on mount
  useEffect(() => {
    if (isVisible) {
      fetch('/api/llm/chat', { method: 'GET' })
        .then(res => res.json())
        .then(data => {
          console.log('[TextChat-Direct-Secure] API health check:', data);
          if (data.status === 'healthy') {
            setConnectionStatus({ text: 'Ready', color: 'bg-green-400' });
          }
        })
        .catch(err => {
          console.error('[TextChat-Direct-Secure] API health check failed:', err);
          setConnectionStatus({ text: 'API Error', color: 'bg-red-400' });
        });
    }
  }, [isVisible]);

  const sendTextMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);
    setConnectionStatus({ text: 'Processing...', color: 'bg-yellow-400' });
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      console.log('[TextChat-Direct-Secure] Sending text message to LLM:', userMessage.content);
      
      // Build conversation history for LLM context (exclude welcome message)
      const conversationHistory = messages
        .filter(msg => msg.id !== 'welcome') // Exclude the welcome message
        .concat(userMessage)
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));

      // Add system message with context
      const systemMessage = {
        role: 'system',
        content: `You are Inti, a helpful AI assistant. Provide clear, concise responses to user questions. ${topicUuid ? `Current conversation topic: ${topicUuid}.` : ''} Be conversational and helpful.`
      };

      const messages_for_llm = [systemMessage, ...conversationHistory];

      console.log('[TextChat-Direct-Secure] Sending authenticated request to secure API');
      
      // Secure API call with authentication and rate limiting
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: getSessionId(), // Session-based authentication
          model: 'auto',
          messages: messages_for_llm,
          temperature: 0.7,
          max_tokens: 512,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `LLM service error: ${response.status} ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      // Initialize assistant response
      currentResponseIdRef.current = `assistant_${Date.now()}`;
      currentResponseRef.current = '';

      // Add empty assistant message for streaming
      setMessages(prev => [...prev, {
        id: currentResponseIdRef.current,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      }]);

      setConnectionStatus({ text: 'Streaming...', color: 'bg-blue-400' });

      // Process streaming chunks
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsLoading(false);
              setConnectionStatus({ text: 'Ready', color: 'bg-green-400' });
              currentResponseRef.current = '';
              currentResponseIdRef.current = '';
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                const deltaContent = parsed.choices[0].delta.content;
                currentResponseRef.current += deltaContent;

                // Update the assistant message with accumulated content
                setMessages(prev => prev.map(msg => 
                  msg.id === currentResponseIdRef.current 
                    ? { ...msg, content: currentResponseRef.current }
                    : msg
                ));
              }
            } catch (e) {
              console.warn('[TextChat-Direct-Secure] Failed to parse streaming chunk:', data);
            }
          }
        }
      }

      setIsLoading(false);
      setConnectionStatus({ text: 'Ready', color: 'bg-green-400' });

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[TextChat-Direct-Secure] Request aborted');
      } else {
        console.error('[TextChat-Direct-Secure] Error sending message:', error);
        setError(`Failed to send message: ${error.message}`);
        setConnectionStatus({ text: 'Error', color: 'bg-red-400' });
      }
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, topicUuid]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const clearChat = () => {
    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setMessages([]);
    setError(null);
    currentResponseRef.current = '';
    currentResponseIdRef.current = '';
    setConnectionStatus({ text: 'Ready', color: 'bg-green-400' });
  };

  // Debug logging
  useEffect(() => {
    console.log('[TextChat-Direct-Secure] Component mounted. isVisible:', isVisible);
  }, [isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isVisible) {
    // console.log('[TextChat-Direct-Secure] Component not visible, returning null');
    return null;
  }

  console.log('[TextChat-Direct-Secure] Rendering component');
  return (
    <div className="flex flex-col h-96 bg-white border border-gray-300 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-blue-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${connectionStatus.color}`}></div>
          <span className="font-medium">Inti Chat - Secure Direct LLM</span>
          {topicUuid && (
            <span className="text-xs opacity-75">({topicUuid})</span>
          )}
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="opacity-75">{connectionStatus.text}</span>
          <button
            onClick={clearChat}
            className="hover:bg-blue-700 px-2 py-1 rounded"
            title="Clear chat"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="hover:bg-blue-700 px-2 py-1 rounded"
              title="Close chat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-2 bg-red-100 border-b border-red-200 text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="break-words">{message.content}</div>
              <div
                className={`text-xs mt-1 opacity-75 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg text-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                <span className="ml-2">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isLoading ? "Please wait..." : "Type your message..."}
            disabled={isLoading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            autoFocus
          />
          <button
            onClick={sendTextMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mt-2 flex justify-between">
          <span>🔒 Secure API (Authenticated + Rate Limited)</span>
          <span>{messages.length} messages</span>
        </div>
      </div>
    </div>
  );
}