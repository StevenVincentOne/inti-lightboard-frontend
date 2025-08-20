// Secure Text Chat Interface with HTTPS + SSE
// This component uses the secure API route with authentication and rate limiting

import React, { useState, useRef, useEffect } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';

interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  response_time_ms?: number;
}

interface IntiTextChatSecureProps {
  isVisible: boolean;
  onClose: () => void;
  topicUuid?: string;
}

export const IntiTextChatSecure: React.FC<IntiTextChatSecureProps> = ({
  isVisible,
  onClose,
  topicUuid
}) => {
  const { authState } = useIntiCommunication();
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get or create session ID
  const getSessionId = () => {
    let sessionId = localStorage.getItem('inti_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('inti_session_id', sessionId);
    }
    return sessionId;
  };

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

  // Add welcome message on mount
  useEffect(() => {
    if (isVisible && chatHistory.length === 0) {
      setChatHistory([{
        id: 'welcome',
        role: 'assistant',
        content: `👋 Hello${authState?.user?.displayName ? ` ${authState.user.displayName}` : ''}! I'm Inti, your AI assistant. How can I help you today?`,
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isVisible, authState?.user?.displayName]);

  // Handle sending message with SSE streaming
  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setConnectionError(null);

    // Add user message to display
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);

    try {
      // Build conversation history (excluding welcome message)
      const conversationHistory = chatHistory
        .filter(msg => msg.id !== 'welcome')
        .concat(userMessage)
        .map(msg => ({
          role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));

      // Add system message
      const systemMessage = {
        role: 'system' as const,
        content: `You are Inti, a helpful and friendly AI assistant. The user's name is ${authState?.user?.displayName || 'User'}.${topicUuid ? ` Topic: ${topicUuid.substring(0, 8)}...` : ''}`
      };

      const startTime = Date.now();

      // Call secure API route with session authentication
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: getSessionId(),
          model: 'auto',
          messages: [systemMessage, ...conversationHistory],
          temperature: 0.7,
          max_tokens: 512,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMessageId = Date.now() + 1;

      // Add placeholder for assistant message
      setChatHistory(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        model: 'Mistral-7B'
      }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                  assistantContent += parsed.choices[0].delta.content;
                  
                  // Update the assistant message
                  setChatHistory(prev => prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: assistantContent }
                      : msg
                  ));
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      const responseTime = Date.now() - startTime;

      // Update final message with response time
      setChatHistory(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, response_time_ms: responseTime }
          : msg
      ));

    } catch (error) {
      console.error('Failed to send message:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to send message');
      
      // Add error message to display
      const errorMessage: ChatMessage = {
        id: Date.now() + 2,
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      };
      
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="inti-text-chat-overlay">
      <div className="inti-text-chat">
        {/* Header */}
        <div className="chat-header">
          <h3>
            💬 Secure Text Chat
            {topicUuid && <span className="topic-id">({topicUuid.substring(0, 8)}...)</span>}
          </h3>
          <div className="header-controls">
            <span className="status connected">🟢 HTTPS + SSE</span>
            <button onClick={onClose} className="close-btn">✖️</button>
          </div>
        </div>

        {/* Connection Error */}
        {connectionError && (
          <div className="error-message">
            ⚠️ {connectionError}
            <button onClick={() => setConnectionError(null)} className="dismiss-btn">✖️</button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="chat-messages">
          {chatHistory.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                {message.role === 'assistant' && message.id !== 'welcome' && (
                  <div className="message-meta">
                    {message.model && (
                      <span className="model">🤖 {message.model}</span>
                    )}
                    {message.response_time_ms && (
                      <span className="response-time">⚡ {message.response_time_ms}ms</span>
                    )}
                    <span className="timestamp">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="chat-input">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={isLoading}
            rows={1}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
            className="send-btn"
          >
            {isLoading ? '⏳' : '➤'}
          </button>
        </div>
      </div>

      <style jsx>{`
        .inti-text-chat-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .inti-text-chat {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          height: 80%;
          max-height: 700px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 12px 12px 0 0;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 18px;
          color: #374151;
        }

        .topic-id {
          font-size: 12px;
          color: #6b7280;
          font-weight: normal;
          margin-left: 8px;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 12px;
          font-weight: 500;
          background: #d1fae5;
          color: #065f46;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .close-btn:hover {
          background: #f3f4f6;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          padding: 12px 16px;
          margin: 8px 16px;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .dismiss-btn {
          background: none;
          border: none;
          color: #991b1b;
          cursor: pointer;
          padding: 0 4px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          display: flex;
          max-width: 85%;
        }

        .message.user {
          align-self: flex-end;
        }

        .message.assistant {
          align-self: flex-start;
        }

        .message-content {
          background: #f3f4f6;
          padding: 12px 16px;
          border-radius: 16px;
          position: relative;
        }

        .message.user .message-content {
          background: #3b82f6;
          color: white;
        }

        .message-text {
          word-wrap: break-word;
          white-space: pre-wrap;
          line-height: 1.4;
        }

        .message-meta {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          font-size: 11px;
          opacity: 0.7;
          flex-wrap: wrap;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #9ca3af;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) {
          animation-delay: -0.32s;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: -0.16s;
        }

        @keyframes typing {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }

        .chat-input {
          display: flex;
          gap: 8px;
          padding: 16px;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
          border-radius: 0 0 12px 12px;
        }

        .chat-input textarea {
          flex: 1;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 12px;
          resize: none;
          max-height: 120px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input textarea:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .chat-input textarea:disabled {
          background: #f3f4f6;
          color: #9ca3af;
        }

        .send-btn {
          padding: 12px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.2s;
          align-self: flex-end;
        }

        .send-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};