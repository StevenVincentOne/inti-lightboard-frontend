// Enhanced Text Chat Interface with Memory Storage
// Integrates local file-based chat storage with WebSocket bridge

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';
import { SimpleMemoryChat, useMemoryChat } from './simple-memory-chat';

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
  topicUuid?: string;
}

export const IntiTextChatWithMemory: React.FC<IntiTextChatProps> = ({
  isVisible,
  onClose,
  topicUuid
}) => {
  const { 
    isConnected, 
    sendMessage, 
    authState 
  } = useIntiCommunication();
  
  // Memory chat integration
  const memoryChat = useMemoryChat(topicUuid || 'default-topic', authState?.user?.id || 1);
  
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

  // Load chat history when topic changes
  useEffect(() => {
    if (topicUuid && memoryChat) {
      loadChatHistory();
    }
  }, [topicUuid]);

  // Load chat history from local storage
  const loadChatHistory = async () => {
    try {
      const history = await memoryChat.loadHistory();
      
      // Convert to ChatMessage format
      const convertedHistory: ChatMessage[] = history.map((msg, index) => ({
        id: index,
        type: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString()
      }));
      
      setChatHistory(convertedHistory);
      console.log(`Loaded ${history.length} messages from local storage`);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    }
  };

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

    window.addEventListener('intiChatMessage', handleChatMessage as EventListener);
    
    return () => {
      window.removeEventListener('intiChatMessage', handleChatMessage as EventListener);
    };
  }, []);

  const startChatSession = () => {
    console.log('Starting chat session...');
    setIsLoading(true);
    setConnectionError(null);
    
    // Generate session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    
    // Send session start via WebSocket
    sendMessage('chat.start_session', { 
      session_id: newSessionId,
      topic_uuid: topicUuid || null 
    });
  };

  const handleSessionStarted = (data: any) => {
    console.log('Chat session started:', data);
    setSessionStarted(true);
    setIsLoading(false);
    setConnectionError(null);
  };

  const handleMessageReceived = (data: any) => {
    console.log('Message received:', data);
    
    const newMessage: ChatMessage = {
      id: chatHistory.length + 1,
      type: 'assistant',
      content: data.content,
      timestamp: new Date().toISOString(),
      model: data.model,
      response_time_ms: data.response_time_ms
    };
    
    setChatHistory(prev => [...prev, newMessage]);
    setIsLoading(false);

    // Save assistant message to local storage
    if (memoryChat && topicUuid) {
      memoryChat.addMessage(data.content, 'assistant');
    }
  };

  const handleHistoryLoaded = (data: any) => {
    console.log('Chat history loaded:', data);
    if (data.messages && Array.isArray(data.messages)) {
      setChatHistory(data.messages);
    }
  };

  const handleSessionEnded = (data: any) => {
    console.log('Chat session ended:', data);
    setSessionStarted(false);
    setSessionId(null);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading || !sessionId) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // Add user message to display
    const userMessage: ChatMessage = {
      id: chatHistory.length + 1,
      type: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);

    // Save user message to local storage with auto-export
    if (memoryChat && topicUuid) {
      try {
        const result = await memoryChat.addMessage(messageText, 'user');
        if (result.exportResults) {
          console.log('Auto-export triggered:', result.exportResults);
        }
      } catch (error) {
        console.error('Failed to save message to local storage:', error);
      }
    }

    // Send message via WebSocket
    sendMessage('chat.send_message', {
      session_id: sessionId,
      content: messageText,
      topic_uuid: topicUuid || null
    });
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
            💬 Text Chat
            {topicUuid && <span className="topic-id">({topicUuid.substring(0, 8)}...)</span>}
          </h3>
          <div className="header-controls">
            {isConnected ? (
              <span className="status connected">🟢 Connected</span>
            ) : (
              <span className="status disconnected">🔴 Disconnected</span>
            )}
            <button onClick={onClose} className="close-btn">✖️</button>
          </div>
        </div>

        {/* Memory Controls */}
        {topicUuid && (
          <SimpleMemoryChat
            topicUuid={topicUuid}
            userId={authState?.user?.id || 1}
            onMessageSent={(message) => console.log('Message sent:', message)}
          />
        )}

        {/* Connection Error */}
        {connectionError && (
          <div className="error-message">
            ⚠️ {connectionError}
            <button onClick={startChatSession} className="retry-btn">Retry</button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="chat-messages">
          {chatHistory.length === 0 && !isLoading && (
            <div className="empty-state">
              <p>👋 Start a conversation!</p>
              {topicUuid && <p>This chat will be saved to topic: {topicUuid.substring(0, 8)}...</p>}
            </div>
          )}
          
          {chatHistory.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                <div className="message-meta">
                  {message.type === 'assistant' && message.model && (
                    <span className="model">🤖 {message.model}</span>
                  )}
                  {message.response_time_ms && (
                    <span className="response-time">⚡ {message.response_time_ms}ms</span>
                  )}
                  <span className="timestamp">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
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
            placeholder={isConnected ? "Type your message... (Enter to send, Shift+Enter for new line)" : "Connecting..."}
            disabled={!isConnected || isLoading}
            rows={1}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading || !isConnected}
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
        }

        .status.connected {
          background: #d1fae5;
          color: #065f46;
        }

        .status.disconnected {
          background: #fee2e2;
          color: #991b1b;
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

        .retry-btn {
          background: #dc2626;
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-state {
          text-align: center;
          color: #6b7280;
          margin: 40px 0;
        }

        .empty-state p {
          margin: 8px 0;
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
        }

        .message.user .message-meta {
          color: rgba(255, 255, 255, 0.8);
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

export default IntiTextChatWithMemory;