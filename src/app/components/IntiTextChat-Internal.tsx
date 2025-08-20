"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import useWebSocket from 'react-use-websocket';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface IntiTextChatInternalProps {
  isVisible: boolean;
  onClose: () => void;
  topicUuid?: string;
}

export default function IntiTextChatInternal({ 
  isVisible,
  topicUuid, 
  onClose
}: IntiTextChatInternalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentResponseRef = useRef<string>('');
  const currentResponseIdRef = useRef<string>('');

  // Get the current domain for WebSocket connection to internal Unmute service
  const webSocketUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1/realtime`
    : null;

  // Use the same WebSocket pattern as Unmute
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    webSocketUrl,
    {
      protocols: ["realtime"],
      shouldReconnect: () => true,
      reconnectAttempts: 5,
      reconnectInterval: 3000,
    }
  );

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initialize session when WebSocket connects
  useEffect(() => {
    if (readyState === 1) { // WebSocket.OPEN
      console.log('[TextChat-Internal] WebSocket connected, initializing session');
      
      // Send session configuration using OpenAI Realtime API format
      const sessionConfig = {
        type: "session.update",
        event_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        session: {
          instructions: `You are Inti, a helpful AI assistant. Provide clear, concise responses to user questions. ${topicUuid ? `Current conversation topic: ${topicUuid}` : ''}`,
          voice: "alloy", // Required field for OpenAI format
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1"
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          },
          tools: [],
          tool_choice: "auto",
          temperature: 0.7,
          max_response_output_tokens: 512
        }
      };
      
      console.log('[TextChat-Internal] Sending session config:', sessionConfig);
      sendMessage(JSON.stringify(sessionConfig));
      
      // Add welcome message
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello! I'm Inti, your AI assistant. ${topicUuid ? `I can see we're discussing topic ${topicUuid}.` : 'What would you like to talk about?'}`,
        timestamp: Date.now()
      };
      setMessages([welcomeMessage]);
    }
  }, [readyState, sendMessage, topicUuid]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage?.data) {
      try {
        const data = JSON.parse(lastMessage.data);
        console.log('[TextChat-Internal] Received message:', data.type, data);

        if (data.type === "response.text.delta") {
          // Handle streaming text response
          console.log('[TextChat-Internal] Text delta:', data.delta);
          
          // Accumulate the response
          if (!currentResponseIdRef.current) {
            currentResponseIdRef.current = `assistant_${Date.now()}`;
            currentResponseRef.current = '';
          }
          
          currentResponseRef.current += data.delta;
          
          // Update or add the assistant message
          setMessages(prev => {
            const existingIndex = prev.findIndex(msg => msg.id === currentResponseIdRef.current);
            const updatedMessage: ChatMessage = {
              id: currentResponseIdRef.current,
              role: 'assistant',
              content: currentResponseRef.current,
              timestamp: Date.now()
            };
            
            if (existingIndex >= 0) {
              const newMessages = [...prev];
              newMessages[existingIndex] = updatedMessage;
              return newMessages;
            } else {
              return [...prev, updatedMessage];
            }
          });
        } else if (data.type === "response.done") {
          // Response complete
          console.log('[TextChat-Internal] Response complete');
          currentResponseRef.current = '';
          currentResponseIdRef.current = '';
          setIsLoading(false);
        } else if (data.type === "error") {
          console.error('[TextChat-Internal] WebSocket error:', data);
          setError(`Server error: ${data.error?.message || 'Unknown error'}`);
          setIsLoading(false);
        } else if (data.type === "session.updated") {
          console.log('[TextChat-Internal] Session updated successfully');
        }
      } catch (error) {
        console.error('[TextChat-Internal] Failed to parse message:', error);
      }
    }
  }, [lastMessage]);

  const sendTextMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading || readyState !== 1) {
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
      console.log('[TextChat-Internal] Sending text message:', userMessage.content);
      
      // Send text input using OpenAI Realtime API format
      const textInputMessage = {
        type: "conversation.item.create",
        event_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        item: {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: userMessage.content
            }
          ]
        }
      };
      
      console.log('[TextChat-Internal] Sending text input:', textInputMessage);
      sendMessage(JSON.stringify(textInputMessage));
      
      // Trigger response generation
      const responseCreateMessage = {
        type: "response.create",
        event_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        response: {
          modalities: ["text"]
        }
      };
      
      console.log('[TextChat-Internal] Triggering response:', responseCreateMessage);
      sendMessage(JSON.stringify(responseCreateMessage));
      
    } catch (error) {
      console.error('[TextChat-Internal] Error sending message:', error);
      setError(`Failed to send message: ${error.message}`);
      setIsLoading(false);
    }
  }, [inputValue, isLoading, readyState, sendMessage]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    currentResponseRef.current = '';
    currentResponseIdRef.current = '';
  };

  const getConnectionStatus = () => {
    switch (readyState) {
      case 0: return { text: 'Connecting...', color: 'bg-yellow-400' };
      case 1: return { text: 'Connected', color: 'bg-green-400' };
      case 2: return { text: 'Closing...', color: 'bg-red-400' };
      case 3: return { text: 'Disconnected', color: 'bg-red-400' };
      default: return { text: 'Unknown', color: 'bg-gray-400' };
    }
  };

  const connectionStatus = getConnectionStatus();

  // Debug logging
  useEffect(() => {
    console.log('[TextChat-Internal] Component mounted. isVisible:', isVisible);
    console.log('[TextChat-Internal] WebSocket URL:', webSocketUrl);
    console.log('[TextChat-Internal] ReadyState:', readyState);
  }, [isVisible, webSocketUrl, readyState]);

  if (!isVisible) {
    console.log('[TextChat-Internal] Component not visible, returning null');
    return null;
  }

  console.log('[TextChat-Internal] Rendering component');
  return (
    <div className="flex flex-col h-96 bg-white border border-gray-300 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-blue-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${connectionStatus.color}`}></div>
          <span className="font-medium">Inti Chat - Internal WebSocket</span>
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
            placeholder={readyState !== 1 ? "Connecting..." : isLoading ? "Please wait..." : "Type your message..."}
            disabled={readyState !== 1 || isLoading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            autoFocus
          />
          <button
            onClick={sendTextMessage}
            disabled={!inputValue.trim() || readyState !== 1 || isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mt-2 flex justify-between">
          <span>Secure internal WebSocket connection</span>
          <span>{messages.length} messages</span>
        </div>
      </div>
    </div>
  );
}