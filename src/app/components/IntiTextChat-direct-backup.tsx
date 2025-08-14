// Working Text Chat Interface with Memory Storage and Direct LLM Integration
// Combines local storage with direct LLM API calls

import React, { useState, useRef, useEffect } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';
import { useMemoryChat } from './simple-memory-chat';

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

export const IntiTextChat: React.FC<IntiTextChatProps> = ({
  isVisible,
  onClose,
  topicUuid
}) => {
  const { authState } = useIntiCommunication();
  
  // Memory chat integration
  const memoryChat = useMemoryChat(topicUuid || 'default-topic', authState?.user?.id || 1);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState(0);
  
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
      loadPendingTokens();
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

  // Load pending tokens count
  const loadPendingTokens = async () => {
    try {
      const exportStatus = await memoryChat.getExportStatus();
      const topicStatus = exportStatus.find(s => s.topicUuid === (topicUuid || 'default-topic'));
      setPendingTokens(topicStatus?.pendingTokens || 0);
    } catch (error) {
      console.error('Failed to load pending tokens:', error);
    }
  };

  // Handle sending message to LLM
  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const messageText = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setConnectionError(null);

    // Add user message to display
    const userMessage: ChatMessage = {
      id: chatHistory.length + 1,
      type: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, userMessage]);

    try {
      // Save user message to local storage with auto-export
      if (memoryChat && topicUuid) {
        const result = await memoryChat.addMessage(messageText, 'user');
        if (result.exportResults) {
          console.log('Auto-export triggered:', result.exportResults);
        }
        await loadPendingTokens(); // Refresh pending count
      }

      // Prepare messages for LLM (last 10 for context)
      const recentMessages = [...chatHistory.slice(-9), userMessage];
      const llmMessages = recentMessages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Add system message
      const systemMessage = {
        role: 'system',
        content: `You are Inti, a helpful and friendly creative assistant. The user's name is ${authState?.user?.displayName || 'User'}.${topicUuid ? ` You are discussing topic: ${topicUuid.substring(0, 8)}...` : ''}`
      };

      const startTime = Date.now();

      // Call LLM API directly
      const response = await fetch('/llm/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mistralai/Mistral-7B-Instruct-v0.2',
          messages: [systemMessage, ...llmMessages],
          max_tokens: 512,
          temperature: 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const responseTime = Date.now() - startTime;
      
      if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
        const assistantContent = responseData.choices[0].message.content;

        // Add assistant message to display
        const assistantMessage: ChatMessage = {
          id: chatHistory.length + 2,
          type: 'assistant',
          content: assistantContent,
          timestamp: new Date().toISOString(),
          model: 'mistralai/Mistral-7B-Instruct-v0.2',
          response_time_ms: responseTime
        };

        setChatHistory(prev => [...prev, assistantMessage]);

        // Save assistant message to local storage
        if (memoryChat && topicUuid) {
          const result = await memoryChat.addMessage(assistantContent, 'assistant');
          if (result.exportResults) {
            console.log('Auto-export triggered for assistant message:', result.exportResults);
          }
          await loadPendingTokens(); // Refresh pending count
        }
      } else {
        throw new Error('Invalid response format from LLM');
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      setConnectionError(error instanceof Error ? error.message : 'Failed to send message');
      
      // Add error message to display
      const errorMessage: ChatMessage = {
        id: chatHistory.length + 2,
        type: 'assistant',
        content: '❌ Sorry, I encountered an error processing your message. Please try again.',
        timestamp: new Date().toISOString()
      };
      
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle "Save to Memory" button
  const handleSaveToMemory = async () => {
    if (!memoryChat || !topicUuid) return;

    try {
      const result = await memoryChat.saveToMemory();
      if (result.success && result.exportResults) {
        console.log('Manual save to memory successful:', result.exportResults);
        await loadPendingTokens(); // Refresh pending count
      }
    } catch (error) {
      console.error('Save to memory failed:', error);
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
            💬 Text Chat
            {topicUuid && <span className="topic-id">({topicUuid.substring(0, 8)}...)</span>}
          </h3>
          <div className="header-controls">
            <span className="status connected">🟢 Direct LLM</span>
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
              title="Reload conversation history"
            >
              📚 Reload History
            </button>
          </div>
        )}

        {/* Connection Error */}
        {connectionError && (
          <div className="error-message">
            ⚠️ {connectionError}
            <button onClick={() => setConnectionError(null)} className="dismiss-btn">✖️</button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="chat-messages">
          {chatHistory.length === 0 && !isLoading && (
            <div className="empty-state">
              <p>👋 Start a conversation!</p>
              {topicUuid && <p>Messages will be saved to topic: {topicUuid.substring(0, 8)}...</p>}
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

export default IntiTextChat;