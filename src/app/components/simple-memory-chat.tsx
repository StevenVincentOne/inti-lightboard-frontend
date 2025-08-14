// Simple Memory-Enabled Chat Component
// Integrates with existing IntiTextChat.tsx

import React, { useState, useEffect } from 'react';
import { BrowserChatExportService } from './browser-chat-export-service';
import BrowserChatFileManager from './browser-chat-file-manager';

interface SimpleMemoryChatProps {
  topicUuid: string;
  userId: number;
  onMessageSent?: (message: string) => void;
  className?: string;
}

export function SimpleMemoryChat({
  topicUuid,
  userId,
  onMessageSent,
  className = ''
}: SimpleMemoryChatProps) {
  const [exportService] = useState(() => new BrowserChatExportService(userId));
  const [fileManager] = useState(() => new BrowserChatFileManager(userId));
  const [pendingTokens, setPendingTokens] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportResult, setLastExportResult] = useState<string>('');

  // Load pending tokens on mount and topic change
  useEffect(() => {
    loadPendingTokens();
  }, [topicUuid]);

  const loadPendingTokens = async () => {
    try {
      const exportStatus = await exportService.getExportStatus();
      const topicStatus = exportStatus.find(s => s.topicUuid === topicUuid);
      setPendingTokens(topicStatus?.pendingTokens || 0);
    } catch (error) {
      console.error('Failed to load pending tokens:', error);
    }
  };

  // Add message to local storage with auto-export
  const addMessage = async (content: string, role: 'user' | 'assistant' | 'system' = 'user') => {
    try {
      const result = await exportService.addMessageWithExport(topicUuid, role, content);
      
      if (result.success) {
        console.log('Message saved locally');
        
        if (result.exportResults) {
          const successCount = result.exportResults.filter(r => r.success).length;
          setLastExportResult(`🔄 Auto-exported: ${successCount} destinations successful`);
          setTimeout(() => setLastExportResult(''), 3000);
        }
        
        await loadPendingTokens(); // Refresh pending count
        
        if (onMessageSent) {
          onMessageSent(content);
        }
      }
    } catch (error) {
      console.error('Failed to add message:', error);
      setLastExportResult('❌ Failed to save message');
      setTimeout(() => setLastExportResult(''), 3000);
    }
  };

  // Handle "Save to Memory" button click
  const handleSaveToMemory = async () => {
    setIsExporting(true);
    setLastExportResult('');

    try {
      const result = await exportService.saveToMemory(topicUuid);
      
      if (result.success && result.exportResults) {
        const successCount = result.exportResults.filter(r => r.success).length;
        const totalCount = result.exportResults.length;
        
        if (successCount === totalCount) {
          setLastExportResult(`✅ Saved ${result.exportResults[0]?.messageCount || 0} messages to memory`);
        } else {
          setLastExportResult(`⚠️ Partially saved: ${successCount}/${totalCount} destinations`);
        }
      } else {
        setLastExportResult('ℹ️ No new content to save');
      }

      await loadPendingTokens(); // Refresh pending count
      
    } catch (error) {
      console.error('Save to memory failed:', error);
      setLastExportResult('❌ Save failed - please try again');
    } finally {
      setIsExporting(false);
      setTimeout(() => setLastExportResult(''), 4000);
    }
  };

  // Load chat history for this topic
  const loadHistory = async () => {
    try {
      const history = await exportService.loadChatHistory(topicUuid);
      console.log(`Loaded ${history.length} messages for topic ${topicUuid}`);
      return history;
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    }
  };

  return (
    <div className={`simple-memory-chat ${className}`}>
      {/* Save to Memory Button */}
      <div className="memory-controls">
        <button
          onClick={handleSaveToMemory}
          disabled={isExporting}
          className="save-to-memory-btn"
          title={`Save ${pendingTokens} pending tokens to memory`}
        >
          {isExporting ? '⏳' : '💾'} Save to Memory
          {pendingTokens > 0 && (
            <span className="pending-badge">{pendingTokens}</span>
          )}
        </button>
        
        <button
          onClick={loadHistory}
          className="load-history-btn"
          title="Load previous conversation history"
        >
          📚 Load History
        </button>
      </div>

      {/* Status Message */}
      {lastExportResult && (
        <div className="export-result">
          {lastExportResult}
        </div>
      )}

      <style jsx>{`
        .simple-memory-chat {
          margin: 8px 0;
          padding: 8px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 6px;
        }

        .memory-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
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

        .save-to-memory-btn:disabled {
          opacity: 0.6;
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

        .export-result {
          padding: 4px 8px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 4px;
          font-size: 11px;
          color: #0c4a6e;
        }
      `}</style>
    </div>
  );
}

// Hook to easily add memory functionality to existing components
export function useMemoryChat(topicUuid: string, userId: number) {
  const [exportService] = useState(() => new BrowserChatExportService(userId));
  
  const addMessage = async (content: string, role: 'user' | 'assistant' | 'system' = 'user') => {
    return await exportService.addMessageWithExport(topicUuid, role, content);
  };

  const saveToMemory = async () => {
    return await exportService.saveToMemory(topicUuid);
  };

  const loadHistory = async () => {
    return await exportService.loadChatHistory(topicUuid);
  };

  const getStats = async () => {
    return await exportService.getStorageStats();
  };

  return {
    addMessage,
    saveToMemory,
    loadHistory,
    getStats
  };
}

export default SimpleMemoryChat;