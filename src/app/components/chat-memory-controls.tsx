// Chat Memory Controls - Save to Memory button and chat history management
// Integrates with local file-based chat storage and export service

import React, { useState, useEffect } from 'react';
import { useChatExport } from './chat-export-service';
import LocalChatFileManager from './local-chat-file-manager';

interface ChatMemoryControlsProps {
  topicUuid: string;
  userId: number;
  onHistoryLoaded?: (messages: any[]) => void;
  className?: string;
}

interface ExportStats {
  pendingTokens: number;
  totalTokens: number;
  lastExported: number;
  messageCount: number;
}

export function ChatMemoryControls({ 
  topicUuid, 
  userId, 
  onHistoryLoaded,
  className = ''
}: ChatMemoryControlsProps) {
  const { saveToMemory, loadHistory, getExportStatus } = useChatExport(userId);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);
  const [lastExportResult, setLastExportResult] = useState<string | null>(null);

  // Load export stats for this topic
  useEffect(() => {
    loadExportStats();
  }, [topicUuid]);

  const loadExportStats = async () => {
    try {
      const allStats = await getExportStatus();
      const topicStats = allStats.find(s => s.topicUuid === topicUuid);
      
      if (topicStats) {
        setExportStats({
          pendingTokens: topicStats.pendingTokens,
          totalTokens: topicStats.totalTokens,
          lastExported: topicStats.lastExported,
          messageCount: 0 // Would need to be added to getExportStatus
        });
      }
    } catch (error) {
      console.error('Failed to load export stats:', error);
    }
  };

  // Handle "Save to Memory" button click
  const handleSaveToMemory = async () => {
    setIsExporting(true);
    setLastExportResult(null);

    try {
      const result = await saveToMemory(topicUuid);
      
      if (result.success && result.exportResults) {
        const successCount = result.exportResults.filter(r => r.success).length;
        const totalCount = result.exportResults.length;
        
        if (successCount === totalCount) {
          setLastExportResult(`✅ Saved ${result.exportResults[0].messageCount} messages to memory`);
        } else {
          setLastExportResult(`⚠️ Partially saved: ${successCount}/${totalCount} destinations`);
        }
      } else {
        setLastExportResult('ℹ️ No new content to save');
      }

      // Refresh stats
      await loadExportStats();
      
    } catch (error) {
      console.error('Save to memory failed:', error);
      setLastExportResult('❌ Save failed - please try again');
    } finally {
      setIsExporting(false);
    }
  };

  // Load chat history for topic resumption
  const handleLoadHistory = async () => {
    setIsLoading(true);

    try {
      const messages = await loadHistory(topicUuid);
      
      if (messages.length > 0) {
        console.log(`Loaded ${messages.length} previous messages for topic ${topicUuid}`);
        if (onHistoryLoaded) {
          onHistoryLoaded(messages);
        }
        setLastExportResult(`📚 Loaded ${messages.length} previous messages`);
      } else {
        setLastExportResult('📭 No previous messages found');
      }
      
    } catch (error) {
      console.error('Failed to load history:', error);
      setLastExportResult('❌ Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  // Format timestamp for display
  const formatLastExported = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className={`chat-memory-controls ${className}`}>
      {/* Save to Memory Button */}
      <div className="memory-actions">
        <button
          onClick={handleSaveToMemory}
          disabled={isExporting}
          className="save-to-memory-btn"
          title={`Save ${exportStats?.pendingTokens || 0} pending tokens to memory`}
        >
          {isExporting ? (
            <span className="loading-spinner">⏳</span>
          ) : (
            <span>💾</span>
          )}
          Save to Memory
          {exportStats && exportStats.pendingTokens > 0 && (
            <span className="pending-badge">{exportStats.pendingTokens}</span>
          )}
        </button>

        {/* Load History Button */}
        <button
          onClick={handleLoadHistory}
          disabled={isLoading}
          className="load-history-btn"
          title="Load previous conversation history for this topic"
        >
          {isLoading ? (
            <span className="loading-spinner">⏳</span>
          ) : (
            <span>📚</span>
          )}
          Load History
        </button>
      </div>

      {/* Export Stats Display */}
      {exportStats && (
        <div className="export-stats">
          <div className="stat-item">
            <span className="stat-label">Total:</span>
            <span className="stat-value">{exportStats.totalTokens} tokens</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Pending:</span>
            <span className="stat-value pending">{exportStats.pendingTokens} tokens</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Last saved:</span>
            <span className="stat-value">{formatLastExported(exportStats.lastExported)}</span>
          </div>
        </div>
      )}

      {/* Result Message */}
      {lastExportResult && (
        <div className="export-result">
          {lastExportResult}
        </div>
      )}

      <style jsx>{`
        .chat-memory-controls {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          font-family: system-ui, -apple-system, sans-serif;
        }

        .memory-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .save-to-memory-btn,
        .load-history-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 14px;
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
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pending-badge {
          background: #ef4444;
          color: white;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          margin-left: 4px;
        }

        .loading-spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .export-stats {
          display: flex;
          gap: 16px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 4px;
          font-size: 12px;
          margin-bottom: 8px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-label {
          color: #6b7280;
          font-weight: 500;
        }

        .stat-value {
          color: #111827;
          font-weight: 600;
        }

        .stat-value.pending {
          color: #ef4444;
        }

        .export-result {
          padding: 6px 8px;
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 4px;
          font-size: 12px;
          color: #0c4a6e;
        }
      `}</style>
    </div>
  );
}

// Enhanced Text Chat Input with Memory Integration
interface MemoryEnabledChatInputProps {
  topicUuid: string;
  userId: number;
  onMessageSent?: (message: string) => void;
  placeholder?: string;
  className?: string;
}

export function MemoryEnabledChatInput({
  topicUuid,
  userId,
  onMessageSent,
  placeholder = "Type your message...",
  className = ''
}: MemoryEnabledChatInputProps) {
  const { addMessage } = useChatExport(userId);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    const messageText = message.trim();
    setMessage('');
    setIsSending(true);

    try {
      // Add to local storage with automatic export handling
      const result = await addMessage(topicUuid, 'user', messageText);
      
      if (result.success) {
        console.log('Message saved locally');
        if (result.exportResults) {
          console.log('Auto-export triggered:', result.exportResults);
        }
        
        if (onMessageSent) {
          onMessageSent(messageText);
        }
      } else {
        console.error('Failed to save message');
        // Could show error toast here
      }

    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSendMessage} className={`memory-chat-input ${className}`}>
      <div className="input-container">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={placeholder}
          disabled={isSending}
          className="message-input"
        />
        <button
          type="submit"
          disabled={!message.trim() || isSending}
          className="send-button"
        >
          {isSending ? '⏳' : '➤'}
        </button>
      </div>

      <style jsx>{`
        .memory-chat-input {
          margin: 8px 0;
        }

        .input-container {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .message-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .message-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .message-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .send-button {
          padding: 12px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.2s;
        }

        .send-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .send-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </form>
  );
}

// Storage Dashboard Component
export function ChatStorageDashboard({ userId }: { userId: number }) {
  const { getStats, getExportStatus, exportAllPending } = useChatExport(userId);
  const [stats, setStats] = useState<any>(null);
  const [exportStatus, setExportStatus] = useState<any[]>([]);
  const [isExportingAll, setIsExportingAll] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, statusData] = await Promise.all([
        getStats(),
        getExportStatus()
      ]);
      
      setStats(statsData);
      setExportStatus(statusData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleExportAll = async () => {
    setIsExportingAll(true);
    try {
      const results = await exportAllPending();
      console.log('Bulk export results:', results);
      await loadData(); // Refresh data
    } catch (error) {
      console.error('Bulk export failed:', error);
    } finally {
      setIsExportingAll(false);
    }
  };

  if (!stats) {
    return <div>Loading storage dashboard...</div>;
  }

  const pendingTopics = exportStatus.filter(s => s.pendingTokens > 0);

  return (
    <div className="storage-dashboard">
      <h3>Chat Storage Dashboard</h3>
      
      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Topics</h4>
          <span className="stat-number">{stats.totalTopics}</span>
        </div>
        <div className="stat-card">
          <h4>Total Messages</h4>
          <span className="stat-number">{stats.totalMessages}</span>
        </div>
        <div className="stat-card">
          <h4>Total Tokens</h4>
          <span className="stat-number">{stats.totalTokens.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <h4>Pending Exports</h4>
          <span className="stat-number pending">{stats.pendingExports}</span>
        </div>
      </div>

      {pendingTopics.length > 0 && (
        <div className="pending-exports">
          <div className="section-header">
            <h4>Pending Exports ({pendingTopics.length} topics)</h4>
            <button
              onClick={handleExportAll}
              disabled={isExportingAll}
              className="export-all-btn"
            >
              {isExportingAll ? '⏳ Exporting...' : '📤 Export All'}
            </button>
          </div>
          
          <div className="pending-list">
            {pendingTopics.map(topic => (
              <div key={topic.topicUuid} className="pending-item">
                <span className="topic-uuid">{topic.topicUuid.substring(0, 8)}...</span>
                <span className="pending-tokens">{topic.pendingTokens} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .storage-dashboard {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 16px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin: 16px 0;
        }

        .stat-card {
          background: #f9fafb;
          padding: 16px;
          border-radius: 6px;
          text-align: center;
        }

        .stat-card h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #6b7280;
        }

        .stat-number {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
        }

        .stat-number.pending {
          color: #ef4444;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 24px 0 12px 0;
        }

        .export-all-btn {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .export-all-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .export-all-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pending-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pending-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #fef2f2;
          border-radius: 4px;
          font-size: 14px;
        }

        .topic-uuid {
          color: #6b7280;
          font-family: monospace;
        }

        .pending-tokens {
          color: #ef4444;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default ChatMemoryControls;