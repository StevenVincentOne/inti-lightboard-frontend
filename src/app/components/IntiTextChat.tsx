// Text Chat Interface Component
// File: /frontend/src/app/components/IntiTextChat.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIntiCommunication } from './IntiCommunicationProvider';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
}

interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string; // For text files
  url?: string; // For file downloads
}

interface IntiTextChatProps {
  isVisible: boolean;
  onClose: () => void;
}

export const IntiTextChat: React.FC<IntiTextChatProps> = ({
  isVisible,
  onClose
}) => {
  const { sendMessage, user } = useIntiCommunication();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList) => {
    const supportedTypes = [
      'text/plain',
      'text/csv',
      'application/pdf',
      'text/markdown',
      'application/json'
    ];

    for (const file of Array.from(files)) {
      if (!supportedTypes.includes(file.type)) {
        alert(`File type "${file.type}" is not supported. Please upload PDF, CSV, TXT, MD, or JSON files.`);
        continue;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert(`File "${file.name}" is too large. Please upload files smaller than 10MB.`);
        continue;
      }

      try {
        let content = '';
        
        if (file.type.startsWith('text/') || file.type === 'application/json') {
          content = await file.text();
        } else if (file.type === 'application/pdf') {
          // For PDFs, we'll send the file info and let the backend handle extraction
          content = `[PDF file: ${file.name}]`;
        }

        const attachment: ChatAttachment = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: file.size,
          content: content
        };

        // Create a message with the file attachment
        const fileMessage: ChatMessage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          type: 'user',
          content: `Uploaded file: ${file.name}`,
          timestamp: Date.now(),
          attachments: [attachment]
        };

        setMessages(prev => [...prev, fileMessage]);

        // Send file to backend
        sendMessage('chat.file_upload', {
          attachment,
          user: user
        });

      } catch (error) {
        console.error('Error processing file:', error);
        alert(`Error processing file "${file.name}". Please try again.`);
      }
    }
  }, [sendMessage, user]);

  // Handle drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  // Send message
  const sendChatMessage = useCallback(() => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: 'user',
      content: inputText.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Send to backend
    sendMessage('chat.message', {
      content: userMessage.content,
      messageId: userMessage.id,
      user: user
    });

    // Simulate AI response (replace with actual backend integration)
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'assistant',
        content: `I received your message: "${userMessage.content}". This is a placeholder response. The actual AI integration will handle this.`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000);
  }, [inputText, isLoading, sendMessage, user]);

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

  if (!isVisible) return null;

  return (
    <div className="fixed left-0 top-0 h-full w-96 bg-black/95 backdrop-blur-sm border-r border-white/10 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-xl">💬</span>
          <h2 className="text-white text-lg font-semibold">Chat with Inti</h2>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors text-xl"
        >
          ✕
        </button>
      </div>

      {/* Messages Container */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragActive && (
          <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-white text-xl font-semibold">
              Drop files here to upload
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center text-white/60 mt-8">
            <div className="text-4xl mb-4">💬</div>
            <p>Start a conversation with Inti</p>
            <p className="text-sm mt-2">You can also drag and drop files here</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.type === 'user' 
                ? 'bg-gradient-to-br from-yellow-600 to-amber-700 text-white' 
                : 'bg-white/10 text-white'
            }`}>
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              
              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.attachments.map((attachment) => (
                    <div 
                      key={attachment.id} 
                      className="flex items-center gap-2 text-sm bg-black/20 rounded p-2"
                    >
                      <span>📎</span>
                      <span>{attachment.name}</span>
                      <span className="text-xs opacity-60">({(attachment.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Copy button for assistant messages */}
              {message.type === 'assistant' && (
                <button
                  onClick={() => copyToClipboard(message.content)}
                  className="mt-2 text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1"
                  title="Copy to clipboard"
                >
                  📋 Copy
                </button>
              )}
              
              <div className="text-xs opacity-60 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/10 text-white p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-pulse">🤔</div>
                Inti is thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Shift+Enter for new line)"
              className="w-full bg-white/10 text-white placeholder-white/60 border border-white/20 rounded-lg p-3 resize-none focus:outline-none focus:border-white/40 min-h-[44px] max-h-32"
              rows={1}
            />
          </div>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Upload file"
          >
            📎
          </button>
          
          <button
            onClick={sendChatMessage}
            disabled={!inputText.trim() || isLoading}
            className={`p-3 rounded-lg transition-colors ${
              inputText.trim() && !isLoading
                ? 'bg-gradient-to-br from-yellow-600 to-amber-700 text-white hover:from-yellow-700 hover:to-amber-800'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
            title="Send message"
          >
            ➤
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.txt,.md,.json"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          className="hidden"
        />

        {user && (
          <div className="text-xs text-white/60 mt-2 text-center">
            Chatting as {user.displayName || user.username}
          </div>
        )}
      </div>
    </div>
  );
};