"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';

interface TopicDraft {
  topic_uuid: string;
  title_final: string;
  status: string;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

interface ActiveDraftStatus {
  has_active_draft: boolean;
  active_draft_uuid: string | null;
  draft_loaded_at: string | null;
}

export default function MinimalTestPage() {
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Array<{timestamp: string, type: string, data: unknown}>>([]);
  const [drafts, setDrafts] = useState<TopicDraft[]>([]);
  const [activeDraft, setActiveDraft] = useState<ActiveDraftStatus | null>(null);
  
  const { sendMessage, isConnected, authState, lastMessage } = useIntiCommunication();

  // Update user data when auth state changes
  useEffect(() => {
    if (authState.authenticated && authState.user) {
      setUserData(authState.user as unknown as Record<string, unknown>);
    } else {
      setUserData(null);
    }
  }, [authState]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      // Add to messages log
      setMessages(prev => [...prev, {
        timestamp: new Date().toISOString(),
        type: `${lastMessage.type} (incoming)`,
        data: lastMessage.data
      }]);

      // Handle specific message types
      switch (lastMessage.type) {
        case 'topic.drafts_list':
          if ((lastMessage.data as {drafts?: TopicDraft[]})?.drafts) {
            setDrafts((lastMessage.data as {drafts: TopicDraft[]}).drafts);
          }
          break;
        
        case 'topic.active_draft':
          if (lastMessage.data) {
            setActiveDraft(lastMessage.data as ActiveDraftStatus);
          }
          break;
        
        case 'topic.draft_loaded':
          if ((lastMessage.data as {success?: boolean})?.success) {
            // Refresh active draft status after successful load
            setTimeout(() => requestActiveDraft(), 500);
          }
          break;
      }
    }
  }, [lastMessage]);

  const requestUserData = () => {
    const requestData = { action: 'get_user_data', timestamp: Date.now() };
    sendMessage('user.get_data', requestData);
    
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'user.get_data (outgoing)',
      data: requestData
    }]);
  };

  const requestTopicData = (topicUUID = '6fc84173-b650-43c2-86e6-6aed73928047') => {
    const requestData = { action: 'get_topic_data', topic_uuid: topicUUID, timestamp: Date.now() };
    sendMessage('topic.get_data', requestData);
    
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'topic.get_data (outgoing)',
      data: requestData
    }]);
  };

  // NEW: Topic draft related functions
  const requestDraftsList = () => {
    const requestData = { timestamp: Date.now() };
    sendMessage('topic.list_drafts', requestData);
    
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'topic.list_drafts (outgoing)',
      data: requestData
    }]);
  };

  const requestActiveDraft = useCallback(() => {
    const requestData = { timestamp: Date.now() };
    sendMessage('topic.get_active_draft', requestData);
    
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'topic.get_active_draft (outgoing)',
      data: requestData
    }]);
  }, [sendMessage]);

  const loadDraft = (topicUUID: string, reason = 'Manual test from PWA') => {
    const requestData = { topic_uuid: topicUUID, reason, timestamp: Date.now() };
    sendMessage('topic.load_draft', requestData);
    
    setMessages(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type: 'topic.load_draft (outgoing)',
      data: requestData
    }]);
  };

  const clearMessages = () => setMessages([]);

  const connectionStatus = isConnected ? 'connected' : 'disconnected';
  const isLoggedIn = authState.authenticated;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Inti Context Center Test Page</h1>
        <p className="text-gray-400 mb-6">Testing topic draft detection and agentic workflow system</p>

        {/* Connection Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">WebSocket: </span>
              <span className={`px-2 py-1 rounded text-sm ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}>
                {connectionStatus}
              </span>
            </div>
            <div>
              <span className="font-medium">Auth State: </span>
              <span className="text-gray-300">
                {authState.loading ? 'Loading...' : (authState.authenticated ? 'Authenticated' : 'Not Authenticated')}
              </span>
            </div>
          </div>
        </div>

        {/* Login Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Step 1: Authentication Status</h2>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded text-sm font-medium ${isLoggedIn ? 'bg-green-600' : 'bg-red-600'}`}>
              {isLoggedIn ? '✓ User Authenticated' : '✗ Not Authenticated'}
            </span>
            <button 
              onClick={requestUserData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              disabled={!isConnected}
            >
              Refresh User Data
            </button>
          </div>
        </div>

        {/* User Data Display */}
        {isLoggedIn && userData && (
          <div className="mb-6 p-4 rounded-lg bg-gray-800">
            <h2 className="text-xl font-semibold mb-4">Step 2: User Profile Data</h2>
            <div className="bg-gray-700 p-4 rounded">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-400">Display Name:</span>
                  <p className="text-white">{userData.displayName as string}</p>
                </div>
                <div>
                  <span className="font-medium text-blue-400">Email:</span>
                  <p className="text-gray-300">{userData.email as string}</p>
                </div>
                <div>
                  <span className="font-medium text-blue-400">User ID:</span>
                  <p className="text-gray-300">{userData.id as string}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Topic Drafts List */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Step 3: Available Topic Drafts</h2>
          <p className="text-gray-400 text-sm mb-4">Lists all drafts from the Replit database for context detection</p>
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={requestDraftsList}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
              disabled={!isConnected || !isLoggedIn}
            >
              📋 List My Drafts
            </button>
            <span className="text-sm text-gray-400">
              {drafts.length > 0 ? `Found ${drafts.length} draft${drafts.length !== 1 ? 's' : ''}` : 'Click to load drafts'}
            </span>
          </div>
          
          {drafts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-700 border border-gray-600 rounded">
                <thead>
                  <tr className="bg-gray-600">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Title</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">UUID</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Category</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft) => (
                    <tr key={draft.topic_uuid} className="border-t border-gray-600 hover:bg-gray-600">
                      <td className="px-4 py-2 text-sm text-white font-medium">{draft.title_final}</td>
                      <td className="px-4 py-2 text-sm text-gray-400 font-mono text-xs">
                        {draft.topic_uuid.substring(0, 8)}...
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          draft.status === 'draft' ? 'bg-yellow-600' : 
                          draft.status === 'published' ? 'bg-green-600' : 'bg-gray-600'
                        }`}>
                          {draft.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-300">{draft.category_name || 'Uncategorized'}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => loadDraft(draft.topic_uuid)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
                          disabled={!isConnected}
                        >
                          🚀 Load Draft
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Active Draft Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Step 4: Active Draft Detection</h2>
          <p className="text-gray-400 text-sm mb-4">Detects which draft is currently loaded for the Context Center</p>
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={requestActiveDraft}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded transition-colors"
              disabled={!isConnected || !isLoggedIn}
            >
              🎯 Check Active Draft
            </button>
            {activeDraft && (
              <span className={`px-3 py-1 rounded text-sm font-medium ${
                activeDraft.has_active_draft ? 'bg-green-600' : 'bg-gray-600'
              }`}>
                {activeDraft.has_active_draft ? '✓ Draft Loaded' : '○ No Active Draft'}
              </span>
            )}
          </div>
          
          {activeDraft && activeDraft.has_active_draft && (
            <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-700 p-4 rounded">
              <h3 className="text-lg font-semibold text-green-400 mb-2">🎯 Active Draft Detected</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-400">Active Draft UUID:</span>
                  <p className="text-gray-300 font-mono">{activeDraft.active_draft_uuid}</p>
                </div>
                <div>
                  <span className="font-medium text-blue-400">Loaded At:</span>
                  <p className="text-gray-300">{
                    activeDraft.draft_loaded_at 
                      ? new Date(activeDraft.draft_loaded_at).toLocaleString()
                      : 'Unknown'
                  }</p>
                </div>
              </div>
              <div className="mt-3 p-3 bg-green-900/20 rounded border border-green-700">
                <p className="text-green-300 text-sm">
                  🤖 <strong>Context Center Ready:</strong> This draft can now provide context to Inti AI for topic-aware responses and editing assistance.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Topic Data Testing */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Step 5: Topic Data Retrieval</h2>
          <p className="text-gray-400 text-sm mb-4">Test retrieving complete topic data (all 27 fields from database)</p>
          <div className="flex gap-4 mb-4">
            <button 
              onClick={() => requestTopicData()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded transition-colors"
              disabled={!isConnected}
            >
              📄 Test Sample Topic
            </button>
            {activeDraft?.active_draft_uuid && (
              <button 
                onClick={() => requestTopicData(activeDraft.active_draft_uuid!)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
                disabled={!isConnected}
              >
                📊 Get Active Draft Data
              </button>
            )}
          </div>
          <input 
            type="text"
            placeholder="Enter topic UUID to retrieve data"
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                requestTopicData(e.currentTarget.value.trim());
                e.currentTarget.value = '';
              }
            }}
          />
        </div>

        {/* Context Center Status */}
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-700">
          <h2 className="text-xl font-semibold mb-2 text-purple-400">🤖 Context Center Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-gray-800 rounded">
              <span className="font-medium text-blue-400">Authentication:</span>
              <p className={`${isLoggedIn ? 'text-green-400' : 'text-red-400'}`}>
                {isLoggedIn ? '✓ Ready' : '✗ Required'}
              </p>
            </div>
            <div className="p-3 bg-gray-800 rounded">
              <span className="font-medium text-blue-400">Draft Detection:</span>
              <p className={`${activeDraft?.has_active_draft ? 'text-green-400' : 'text-yellow-400'}`}>
                {activeDraft?.has_active_draft ? '✓ Draft Loaded' : 'ℹ No Active Draft'}
              </p>
            </div>
            <div className="p-3 bg-gray-800 rounded">
              <span className="font-medium text-blue-400">WebSocket:</span>
              <p className={`${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isConnected ? '✓ Connected' : '✗ Disconnected'}
              </p>
            </div>
          </div>
        </div>

        {/* Messages Log */}
        <div className="p-4 rounded-lg bg-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">WebSocket Messages ({messages.length})</h2>
            <button 
              onClick={clearMessages}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm"
            >
              Clear Log
            </button>
          </div>
          
          <div className="max-h-96 overflow-y-auto border border-gray-700 rounded p-2">
            {messages.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                <p className="text-lg">📡 No messages yet</p>
                <p className="text-sm">Try the test actions above to see WebSocket communication</p>
              </div>
            ) : (
              [...messages].reverse().map((message, index) => (
                <div key={index} className="mb-3 p-3 rounded bg-gray-700 border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      message.type.includes('outgoing') ? 'bg-blue-600' : 'bg-green-600'
                    }`}>
                      {message.type.includes('outgoing') ? '📤' : '📥'} {message.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(message.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Info */}
        <div className="mt-6 p-4 rounded-lg bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">📋 System Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-blue-400 mb-2">Enhanced Users Table Fields:</h4>
              <p className="text-gray-400">Standard fields plus: <strong className="text-yellow-400">current_draft_uuid, draft_loaded_at</strong> (for active draft tracking)</p>
            </div>
            <div>
              <h4 className="font-medium text-green-400 mb-2">New WebSocket Commands:</h4>
              <p className="text-gray-400"><strong>topic.list_drafts</strong> • <strong>topic.get_active_draft</strong> • <strong>topic.load_draft</strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}