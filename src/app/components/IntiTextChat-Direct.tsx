"use client";

import { useState, useRef, useEffect } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface IntiTextChatDirectProps {
  topicUuid?: string;
  onClose?: () => void;
}

export default function IntiTextChatDirect({ topicUuid, onClose }: IntiTextChatDirectProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useIntiCommunication();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with welcome message
  useEffect(() => {
    if (isAuthenticated && user) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello ${user.displayName || user.username}! I'm ready to help you with your questions. ${topicUuid ? `I can see we're discussing topic ${topicUuid}.` : 'What would you like to talk about?'}`,
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
      console.log('[TextChat-Direct] Initialized with user:', user.displayName);
    }
  }, [isAuthenticated, user, topicUuid]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading || !isAuthenticated) {
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

    try {
      console.log('[TextChat-Direct] Sending message to direct LLM:', userMessage.content);
      
      // Prepare context for the LLM
      const context = {
        user: {
          name: user?.displayName || user?.username || 'User',
          id: user?.id
        },
        topic: topicUuid ? { uuid: topicUuid } : null,
        timestamp: new Date().toISOString()
      };

      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Add current user message
      conversationHistory.push({
        role: 'user',
        content: userMessage.content
      });

      // Call LLM directly via internal API
      const response = await fetch('/llm/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistralai/Mistral-7B-Instruct-v0.2',
          messages: [
            {
              role: 'system',
              content: `You are Inti, an intelligent assistant helping ${context.user.name}. ${context.topic ? `The current topic being discussed is: ${context.topic.uuid}` : ''} Be helpful, concise, and conversational. Current time: ${context.timestamp}`
            },
            ...conversationHistory
          ],
          max_tokens: 512,
          temperature: 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[TextChat-Direct] LLM response received:', data);

      if (data.choices && data.choices[0] && data.choices[0].message) {
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: data.choices[0].message.content,
          timestamp: Date.now()
        };

        setMessages(prev => [...prev, assistantMessage]);
        console.log('[TextChat-Direct] Added assistant response');
      } else {
        throw new Error('Invalid response format from LLM');
      }

    } catch (error) {
      console.error('[TextChat-Direct] Error sending message:', error);
      setError(`Failed to get response: ${error.message}`);
      
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Please log in to use the chat feature.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-96 bg-white border border-gray-300 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-blue-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span className="font-medium">Inti Chat - Direct LLM</span>
          {topicUuid && (
            <span className="text-xs opacity-75">({topicUuid})</span>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={clearChat}
            className="text-xs hover:bg-blue-700 px-2 py-1 rounded"
            title="Clear chat"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs hover:bg-blue-700 px-2 py-1 rounded"
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
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mt-2 flex justify-between">
          <span>Direct connection to Inti LLM</span>
          <span>{messages.length} messages</span>
        </div>
      </div>
    </div>
  );
}