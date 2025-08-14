// Secure Text Chat Interface with WebSocket Bridge and Memory Storage
// Uses secure backend handlers with authentication, rate limiting, and proper error handling

import React, { useState, useRef, useEffect } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';
import { useMemoryChat } from './simple-memory-chat';

interface ChatMessage {
  id: number | string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  response_time_ms?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface IntiTextChatProps {
  isVisible: boolean;
  onClose: () => void;
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
  
  // Memory chat integration
  const memoryChat = useMemoryChat(topicUuid || 'default-topic', authState?.user?.id || 1);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [pendingTokens, setPendingTokens] = useState(0);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  
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

  // Load chat history when topic changes
  useEffect(() => {
    if (topicUuid && memoryChat) {
      loadChatHistory();
      loadPendingTokens();
    }
  }, [topicUuid]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    const handleChatMessage = (event: CustomEvent) => {
      const message = event.detail;
      
      console.log('[TextChat] Received message:', message.type);
      
      switch (message.type) {
        case 'text_chat.session_started':
          handleSessionStarted(message.data);
          break;
          
        case 'text_chat.message_received':
          handleMessageReceived(message.data);
          break;
          
        case 'text_chat.history_loaded':
          handleHistoryLoaded(message.data);
          break;
          
        case 'text_chat.session_ended':
          handleSessionEnded(message.data);
          break;
          
        case 'error':
          handleError(message.data);
          break;
      }
    };

    window.addEventListener('intiChatMessage', handleChatMessage as EventListener);
    
    return () => {
      window.removeEventListener('intiChatMessage', handleChatMessage as EventListener);
    };
  }, []);

  // Load chat history from local storage
  const loadChatHistory = async () => {
    try {
      const history = await memoryChat.loadHistory();
      
      // Convert to ChatMessage format
      const convertedHistory: ChatMessage[] = history.map((msg, index) => ({
        id: `local_${index}`,
        type: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp).toISOString()
      }));
      
      setChatHistory(convertedHistory);
      console.log(`[TextChat] Loaded ${history.length} messages from local storage`);
    } catch (error) {
      console.error('[TextChat] Failed to load chat history:', error);
    }
  };

  // Load pending tokens count
  const loadPendingTokens = async () => {
    try {
      const exportStatus = await memoryChat.getExportStatus();
      const topicStatus = exportStatus.find(s => s.topicUuid === (topicUuid || 'default-topic'));
      setPendingTokens(topicStatus?.pendingTokens || 0);
    } catch (error) {
      console.error('[TextChat] Failed to load pending tokens:', error);
    }
  };

  const startChatSession = () => {
    console.log('[TextChat] Starting secure chat session...');
    setIsLoading(true);
    setConnectionError(null);
    setRateLimitError(null);
    
    // Generate session ID
    const newSessionId = `secure_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    
    // Send session start via WebSocket
    sendMessage('text_chat.start_session', { 
      sessionId: newSessionId,
      topicUuid: topicUuid || null,
      context: topicUuid ? `Discussion about topic: ${topicUuid}` : null
    });
  };

  const handleSessionStarted = (data: any) => {
    console.log('[TextChat] Secure session started:', data);
    setSessionStarted(true);
    setIsLoading(false);
    setConnectionError(null);
  };

  const handleMessageReceived = async (data: any) => {
    console.log('[TextChat] Message received:', data);
    
    const newMessage: ChatMessage = {
      id: data.messageId || Date.now(),
      type: data.type,
      content: data.content,
      timestamp: data.timestamp,
      model: data.model,
      response_time_ms: data.response_time_ms,
      usage: data.usage
    };
    
    setChatHistory(prev => [...prev, newMessage]);
    
    if (data.type === 'assistant') {
      setIsLoading(false);
    }

    // Save to local storage with auto-export
    if (memoryChat && topicUuid) {
      try {
        const result = await memoryChat.addMessage(data.content, data.type);
        if (result.exportResults) {
          console.log('[TextChat] Auto-export triggered:', result.exportResults);
        }
        await loadPendingTokens(); // Refresh pending count
      } catch (error) {
        console.error('[TextChat] Failed to save to local storage:', error);
      }
    }
  };

  const handleHistoryLoaded = (data: any) => {
    console.log('[TextChat] History loaded:', data);
    if (data.messages && Array.isArray(data.messages)) {
      const formattedMessages = data.messages.map((msg: any) => ({
        id: msg.id,
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        model: msg.model,
        response_time_ms: msg.response_time_ms
      }));
      setChatHistory(formattedMessages);
    }
  };

  const handleSessionEnded = (data: any) => {
    console.log('[TextChat] Session ended:', data);
    setSessionStarted(false);
    setSessionId(null);
  };

  const handleError = (data: any) => {
    console.error('[TextChat] Error received:', data);
    setIsLoading(false);
    
    if (data.code === 'RATE_LIMIT' || data.code === 'TOKEN_LIMIT') {
      setRateLimitError(data.message);
      setTimeout(() => setRateLimitError(null), 10000); // Clear after 10 seconds
    } else {
      setConnectionError(data.message);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading || !sessionId || !isConnected) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setConnectionError(null);
    setRateLimitError(null);

    // Add user message to display immediately
    const userMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      type: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);

    // Send message via secure WebSocket
    sendMessage('text_chat.send_message', {
      content: messageText,
      sessionId: sessionId,
      topicUuid: topicUuid || null
    });
  };

  // Handle "Save to Memory" button
  const handleSaveToMemory = async () => {
    if (!memoryChat || !topicUuid) return;

    try {
      const result = await memoryChat.saveToMemory();
      if (result.success && result.exportResults) {
        console.log('[TextChat] Manual save to memory successful:', result.exportResults);
        await loadPendingTokens(); // Refresh pending count
      }
    } catch (error) {
      console.error('[TextChat] Save to memory failed:', error);
    }
  };

  // Load server-side history
  const handleLoadServerHistory = () => {
    if (sessionId && isConnected) {
      sendMessage('text_chat.get_history', {
        sessionId: sessionId,
        limit: 50
      });
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
            {isConnected ? (
              <span className="status connected">🟢 Secure WebSocket</span>
            ) : (
              <span className="status disconnected">🔴 Disconnected</span>
            )}
            <button onClick={onClose} className="close-btn">✖️</button>
          </div>
        </div>

        {/* Memory Controls */}
        {topicUuid && (
          <div className="memory-controls">
            <button
              onClick={handleSaveToMemory}
              className="save-to-memory-btn"
              title={`Save ${pendingTokens} pending tokens to memory`}
            >
              💾 Save to Memory
              {pendingTokens > 0 && (
                <span className="pending-badge">{pendingTokens}</span>
              )}
            </button>
            
            <button
              onClick={loadChatHistory}
              className="load-history-btn"
              title="Load local conversation history"
            >
              📚 Local History
            </button>

            <button
              onClick={handleLoadServerHistory}
              className="load-history-btn"
              title="Load server conversation history"
              disabled={!isConnected || !sessionId}
            >
              🌐 Server History
            </button>
          </div>
        )}

        {/* Error Messages */}
        {connectionError && (
          <div className="error-message">
            ⚠️ {connectionError}
            <button onClick={() => setConnectionError(null)} className="dismiss-btn">✖️</button>
          </div>
        )}

        {rateLimitError && (
          <div className="rate-limit-message">
            🚦 {rateLimitError}
            <button onClick={() => setRateLimitError(null)} className="dismiss-btn">✖️</button>
          </div>
        )}

        {!isConnected && (
          <div className="connection-warning">
            🔌 WebSocket not connected. Please wait for connection...
          </div>
        )}

        {/* Chat Messages */}
        <div className="chat-messages">
          {chatHistory.length === 0 && !isLoading && (
            <div className="empty-state">
              <p>👋 Start a secure conversation!</p>
              {topicUuid && <p>Messages will be saved to topic: {topicUuid.substring(0, 8)}...</p>}
              <p>🛡️ Protected by authentication and rate limiting</p>
            </div>
          )}
          
          {chatHistory.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                <div className="message-meta">
                  {message.type === 'assistant' && message.model && (
                    <span className="model">🤖 {message.model.split('/')[1]}</span>
                  )}
                  {message.response_time_ms && (
                    <span className="response-time">⚡ {message.response_time_ms}ms</span>
                  )}
                  {message.usage && (
                    <span className="usage">📊 {message.usage.total_tokens} tokens</span>
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
                <div className="loading-text">🛡️ Processing securely...</div>
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
            placeholder={
              !isConnected 
                ? "Connecting to secure chat..." 
                : rateLimitError 
                  ? "Rate limited - please wait..."
                  : "Type your message... (Enter to send, Shift+Enter for new line)"
            }
            disabled={!isConnected || isLoading || !!rateLimitError}
            rows={1}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading || !isConnected || !!rateLimitError}
            className="send-btn"
          >
            {isLoading ? '⏳' : '🛡️➤'}
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
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
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

        .memory-controls {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #fafafa;
          border-bottom: 1px solid #e5e7eb;
        }

        .save-to-memory-btn,
        .load-history-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
          position: relative;
        }

        .save-to-memory-btn:hover,
        .load-history-btn:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .save-to-memory-btn:disabled,
        .load-history-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pending-badge {
          background: #ef4444;
          color: white;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 8px;
          margin-left: 4px;
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

        .rate-limit-message {
          background: #fef3c7;
          border: 1px solid #fbbf24;
          color: #92400e;
          padding: 12px 16px;
          margin: 8px 16px;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .connection-warning {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e40af;
          padding: 12px 16px;
          margin: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          text-align: center;
        }

        .dismiss-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0 4px;
          opacity: 0.7;
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
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
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

        .message.user .message-meta {
          color: rgba(255, 255, 255, 0.8);
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          align-items: center;
          margin-bottom: 8px;
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

        .loading-text {
          font-size: 12px;
          color: #6b7280;
          font-style: italic;
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
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
          align-self: flex-end;
        }

        .send-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
};

export default IntiTextChat;