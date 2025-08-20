'use client';

import React, { useState, useEffect } from 'react';
import { useUCO } from '../hooks/useUCO';

export function UCOTestComponent() {
  const { 
    uco, 
    loading, 
    error, 
    connected,
    addConversation,
    user,
    topic,
    conversation,
    recentMessages,
    mode,
    refresh,
    metadata 
  } = useUCO();

  // Logging state
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(true);

  // Add log function
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-50), logEntry]); // Keep last 50 logs
    console.log('[UCO Dashboard]', logEntry);
  };

  // Monitor UCO state changes
  useEffect(() => {
    addLog(`UCO state changed - Loading: ${loading}, Connected: ${connected}, Error: ${error}`);
    if (uco) {
      addLog(`UCO data received - Components: ${Object.keys(uco.components || {}).join(', ')}`);
    }
  }, [uco, loading, connected, error]);

  // Monitor user data changes
  useEffect(() => {
    if (user) {
      addLog(`User data updated - ID: ${user.id}, Name: ${user.name}`);
    } else {
      addLog('User data cleared');
    }
  }, [user]);

  // Monitor topic data changes
  useEffect(() => {
    if (topic) {
      addLog(`Topic data updated - Loaded: ${topic.loaded}, Title: ${topic.title}`);
    } else {
      addLog('Topic data cleared');
    }
  }, [topic]);

  // Monitor conversation changes
  useEffect(() => {
    if (conversation) {
      addLog(`Conversation updated - Mode: ${conversation.mode}, Messages: ${conversation.recent?.length || 0}`);
    } else {
      addLog('Conversation data cleared');
    }
  }, [conversation]);

  // Initial load log
  useEffect(() => {
    addLog('UCO Dashboard initialized');
  }, []);

  const handleAddTestMessage = async () => {
    addLog('Attempting to add text message...');
    try {
      await addConversation('Hello UCO! This is a test message.', 'text', 'user');
      addLog('Text message added successfully');
    } catch (error) {
      addLog(`Error adding text message: ${error}`);
    }
  };

  const handleAddVoiceTest = async () => {
    addLog('Attempting to add voice message...');
    try {
      await addConversation('This is a voice test message.', 'voice', 'user');
      addLog('Voice message added successfully');
    } catch (error) {
      addLog(`Error adding voice message: ${error}`);
    }
  };

  const handleRefresh = () => {
    addLog('Manual refresh triggered');
    refresh();
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('Logs cleared');
  };

  // Component status indicators
  const getComponentStatus = (componentData: any) => {
    if (!componentData) return { status: 'disconnected', color: 'text-red-500', bg: 'bg-red-100' };
    if (Object.keys(componentData).length === 0) return { status: 'empty', color: 'text-yellow-500', bg: 'bg-yellow-100' };
    return { status: 'connected', color: 'text-green-500', bg: 'bg-green-100' };
  };

  const userStatus = getComponentStatus(user);
  const topicStatus = getComponentStatus(topic);
  const conversationStatus = getComponentStatus(conversation);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">UCO State Dashboard</h1>
        
        {/* System Status Overview */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${loading ? 'text-yellow-500' : 'text-green-500'}`}>
                {loading ? 'Loading' : 'Ready'}
              </div>
              <div className="text-sm text-gray-600">UCO State</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${connected ? 'text-green-500' : 'text-red-500'}`}>
                {connected ? '●' : '○'}
              </div>
              <div className="text-sm text-gray-600">WebSocket</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${userStatus.color}`}>
                {userStatus.status === 'connected' ? '●' : userStatus.status === 'empty' ? '◐' : '○'}
              </div>
              <div className="text-sm text-gray-600">User Data</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${topicStatus.color}`}>
                {topicStatus.status === 'connected' ? '●' : topicStatus.status === 'empty' ? '◐' : '○'}
              </div>
              <div className="text-sm text-gray-600">Topic Data</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${conversationStatus.color}`}>
                {conversationStatus.status === 'connected' ? '●' : conversationStatus.status === 'empty' ? '◐' : '○'}
              </div>
              <div className="text-sm text-gray-600">Conversation</div>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* UCO Metadata */}
        {metadata && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">UCO Metadata</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div><strong>User ID:</strong> {metadata.userId}</div>
              <div><strong>Session:</strong> {metadata.sessionId ? metadata.sessionId.substring(0, 8) + '...' : 'None'}</div>
              <div><strong>Total Fields:</strong> {metadata.totalFields}</div>
              <div><strong>Confidence:</strong> {metadata.confidence}</div>
              <div><strong>Subscriptions:</strong> {metadata.subscriptions?.join(', ') || 'None'}</div>
              <div><strong>Privacy:</strong> {metadata.privacy}</div>
            </div>
          </div>
        )}

        {/* Component Data Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          
          {/* User Component */}
          <div className="bg-white rounded-lg shadow">
            <div className={`p-4 rounded-t-lg ${userStatus.bg}`}>
              <h3 className="font-semibold text-gray-800 flex items-center">
                <span className={`mr-2 ${userStatus.color}`}>●</span>
                User Component
              </h3>
              <div className="text-sm text-gray-600 mt-1">
                Status: {userStatus.status}
              </div>
            </div>
            <div className="p-4">
              {user ? (
                <div className="space-y-2 text-sm">
                  <div><strong>ID:</strong> {user.id}</div>
                  <div><strong>Name:</strong> {user.name || 'Not set'}</div>
                  <div><strong>Bio:</strong> {user.bio || 'Not set'}</div>
                  <div><strong>Activity:</strong> {user.currentActivity || 'Not set'}</div>
                  
                  {/* Show ALL raw user data fields */}
                  {user.data && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800">All User Fields ({Object.keys(user.data).length})</summary>
                      <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-xs">
                        {Object.entries(user.data).map(([key, value]) => (
                          <div key={key} className="py-1 border-b border-gray-200 last:border-0">
                            <strong>{key}:</strong> {value !== null && value !== undefined ? 
                              (typeof value === 'object' ? JSON.stringify(value) : String(value)) : 
                              <span className="text-gray-400">null</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No user data received</div>
              )}
            </div>
          </div>

          {/* Topic Component */}
          <div className="bg-white rounded-lg shadow">
            <div className={`p-4 rounded-t-lg ${topicStatus.bg}`}>
              <h3 className="font-semibold text-gray-800 flex items-center">
                <span className={`mr-2 ${topicStatus.color}`}>●</span>
                Topic Component
              </h3>
              <div className="text-sm text-gray-600 mt-1">
                Status: {topicStatus.status}
              </div>
            </div>
            <div className="p-4">
              {topic ? (
                <div className="space-y-2 text-sm">
                  <div><strong>Loaded:</strong> {topic.loaded ? 'Yes' : 'No'}</div>
                  <div><strong>UUID:</strong> {topic.uuid || 'None'}</div>
                  <div><strong>Title:</strong> {topic.title || 'None'}</div>
                  <div><strong>Stage:</strong> {topic.stage || 'None'}</div>
                  
                  {/* Show ALL raw topic data fields */}
                  {topic.data && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800">All Topic Fields ({Object.keys(topic.data).length})</summary>
                      <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-xs">
                        {Object.entries(topic.data).map(([key, value]) => (
                          <div key={key} className="py-1 border-b border-gray-200 last:border-0">
                            <strong>{key}:</strong> {value !== null && value !== undefined ? 
                              (typeof value === 'object' ? JSON.stringify(value).substring(0, 100) + (JSON.stringify(value).length > 100 ? '...' : '') : String(value)) : 
                              <span className="text-gray-400">null</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No topic data received</div>
              )}
            </div>
          </div>

          {/* Conversation Component */}
          <div className="bg-white rounded-lg shadow">
            <div className={`p-4 rounded-t-lg ${conversationStatus.bg}`}>
              <h3 className="font-semibold text-gray-800 flex items-center">
                <span className={`mr-2 ${conversationStatus.color}`}>●</span>
                Conversation Component
              </h3>
              <div className="text-sm text-gray-600 mt-1">
                Status: {conversationStatus.status}
              </div>
            </div>
            <div className="p-4">
              {conversation ? (
                <div className="space-y-2 text-sm">
                  <div><strong>Mode:</strong> {conversation.mode || 'None'}</div>
                  <div><strong>Messages:</strong> {conversation.recent?.length || 0}</div>
                  <div><strong>Intent:</strong> {conversation.intent || 'None'}</div>
                  {conversation.recent?.length > 0 && (
                    <div><strong>Last:</strong> {new Date(conversation.recent[conversation.recent.length - 1].timestamp).toLocaleTimeString()}</div>
                  )}
                  
                  {/* Show ALL raw conversation data fields */}
                  {conversation.data && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800">All Conversation Fields ({Object.keys(conversation.data).length})</summary>
                      <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-xs">
                        {Object.entries(conversation.data).map(([key, value]) => (
                          <div key={key} className="py-1 border-b border-gray-200 last:border-0">
                            <strong>{key}:</strong> {value !== null && value !== undefined ? 
                              (typeof value === 'object' ? JSON.stringify(value).substring(0, 100) + (JSON.stringify(value).length > 100 ? '...' : '') : String(value)) : 
                              <span className="text-gray-400">null</span>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No conversation data received</div>
              )}
            </div>
          </div>
        </div>

        {/* Live Conversation Feed */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Live Conversation Feed</h2>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-600">
              Mode: <span className="font-semibold">{mode || 'None'}</span> | 
              Total Messages: <span className="font-semibold">{recentMessages?.length || 0}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddTestMessage}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                disabled={loading || !connected}
              >
                Test Text
              </button>
              <button
                onClick={handleAddVoiceTest}
                className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                disabled={loading || !connected}
              >
                Test Voice
              </button>
              <button
                onClick={handleRefresh}
                className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
              >
                Refresh
              </button>
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto border rounded">
            {recentMessages && recentMessages.length > 0 ? (
              recentMessages.map((msg, index) => (
                <div key={msg.id || index} className="p-3 border-b last:border-b-0 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded ${
                        msg.type === 'voice' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {msg.type}
                      </span>
                      <span className={`font-semibold ${
                        msg.role === 'user' ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        {msg.role}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-700 mt-2">{msg.content}</div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                No conversation messages yet. Use the test buttons to add some.
              </div>
            )}
          </div>
        </div>

        {/* Raw UCO Data Viewer */}
        {uco && (
          <details className="bg-white rounded-lg shadow p-6 mb-6">
            <summary className="cursor-pointer text-lg font-semibold hover:text-blue-600">
              Raw UCO Data (Debug View)
            </summary>
            <div className="mt-4">
              <div className="text-sm text-gray-600 mb-2">
                Full UCO v15 structure with all fields and metadata
              </div>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                <pre className="text-xs font-mono">
                  {JSON.stringify(uco, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        )}

        {/* Debug Logs Panel */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Debug Logs</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                {showLogs ? 'Hide' : 'Show'} Logs
              </button>
              <button
                onClick={clearLogs}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Clear Logs
              </button>
            </div>
          </div>
          
          {showLogs && (
            <div className="bg-black text-green-400 p-4 rounded font-mono text-sm max-h-60 overflow-y-auto">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-gray-500">No logs yet...</div>
              )}
            </div>
          )}
          
          <div className="mt-4 text-sm text-gray-600">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <strong>Connection Info:</strong>
                <div>Loading: {loading ? 'Yes' : 'No'}</div>
                <div>Connected: {connected ? 'Yes' : 'No'}</div>
                <div>Error: {error || 'None'}</div>
              </div>
              <div>
                <strong>Data Status:</strong>
                <div>UCO Object: {uco ? 'Present' : 'None'}</div>
                <div>User Data: {user ? 'Present' : 'None'}</div>
                <div>Topic Data: {topic ? 'Present' : 'None'}</div>
                <div>Conversation: {conversation ? 'Present' : 'None'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Raw UCO State Inspector */}
        <div className="bg-white rounded-lg shadow p-6">
          <details>
            <summary className="cursor-pointer font-semibold text-gray-700 text-xl mb-4">
              Raw UCO State Inspector
            </summary>
            <div className="mt-4">
              {uco ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Metadata</h4>
                    <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
                      {JSON.stringify(uco.metadata || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Components</h4>
                    <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-60">
                      {JSON.stringify(uco.components || {}, null, 2)}
                    </pre>
                  </div>
                  {uco.activeGraph && (
                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">Active Graph</h4>
                      <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
                        {JSON.stringify(uco.activeGraph, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  No UCO data available
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}