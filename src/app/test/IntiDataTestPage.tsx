import React, { useState, useEffect } from 'react';
import { useIntiCommunication } from '../hooks/useIntiCommunication';

export default function MinimalTestPage() {
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Array<{timestamp: string, type: string, data: unknown}>>([]);
  
  const { sendMessage, isConnected, authState } = useIntiCommunication();

  // Update user data when auth state changes
  useEffect(() => {
    if (authState.authenticated && authState.user) {
      setUserData(authState.user as unknown as Record<string, unknown>);
    } else {
      setUserData(null);
    }
  }, [authState]);

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

  const clearMessages = () => setMessages([]);

  const connectionStatus = isConnected ? 'connected' : 'disconnected';
  const isLoggedIn = authState.authenticated;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Inti Data Bridge Test Page</h1>
        <p className="text-gray-400 mb-6">Testing data flow from Replit database to PWA</p>

        {/* Connection Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">WebSocket: </span>
              <span className={`px-2 py-1 rounded text-sm ${connectionStatus === 'connected' ? 'bg-green-600' : 'bg-red-600'}`}>
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
          <h2 className="text-xl font-semibold mb-2">Step 1: Login Status</h2>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded text-sm font-medium ${isLoggedIn ? 'bg-green-600' : 'bg-red-600'}`}>
              {isLoggedIn ? '✓ User Logged In' : '✗ User Not Logged In'}
            </span>
            <button 
              onClick={requestUserData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              disabled={!isConnected}
            >
              Request User Data
            </button>
          </div>
        </div>

        {/* User Data Display */}
        {isLoggedIn && userData && (
          <div className="mb-6 p-4 rounded-lg bg-gray-800">
            <h2 className="text-xl font-semibold mb-4">Step 2: User Data from Replit</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-700 border border-gray-600">
                <thead>
                  <tr className="bg-gray-600">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Field</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-200">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(userData).map(([key, value]) => (
                    <tr key={key} className="border-t border-gray-600">
                      <td className="px-4 py-2 text-sm font-medium text-blue-400">{key}</td>
                      <td className="px-4 py-2 text-sm text-gray-300 break-all">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Topic Testing */}
        <div className="mb-6 p-4 rounded-lg bg-gray-800">
          <h2 className="text-xl font-semibold mb-2">Step 3: Topic Data Testing</h2>
          <div className="flex gap-4">
            <button 
              onClick={() => requestTopicData()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
              disabled={!isConnected}
            >
              Test Sample Topic
            </button>
            <input 
              type="text"
              placeholder="Enter topic UUID"
              className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-white"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  requestTopicData(e.currentTarget.value.trim());
                  e.currentTarget.value = '';
                }
              }}
            />
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
              Clear
            </button>
          </div>
          
          <div className="max-h-96 overflow-y-auto border border-gray-700 rounded p-2">
            {messages.length === 0 ? (
              <div className="text-gray-400 text-center py-4">
                No messages yet. Try the test actions above.
              </div>
            ) : (
              messages.map((message, index) => (
                <div key={index} className="mb-3 p-3 rounded bg-gray-700 border-l-4 border-l-blue-500">
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-600">
                      {message.type}
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

        {/* Expected Fields Reference */}
        <div className="mt-6 p-4 rounded-lg bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold mb-2">Expected Database Fields</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-blue-400 mb-2">Users Table:</h4>
              <p className="text-gray-400">id, username, email, display_name, profile_image_url, role, wallet_address, intis_earned_total, intis_livetopics, intis_contributes, created_at, interests, bio, website, x_twitter_handle, github_username, coinbase_id, kyc_approved, refresh_token, identity_status, email_status, updated_at</p>
            </div>
            <div>
              <h4 className="font-medium text-green-400 mb-2">Topic_Drafts Table:</h4>
              <p className="text-gray-400">id, topic_uuid, user_id, status, topic_type_id, topic_type_name, topic_type_description, audience, audience_name, about_what, about_why, about_ai, about_final, category_main, category_name, title_contributor, title_ai, title_final, content_draft, content_rev_ai, content_prompt, content_draft_ai, content_live_orig, content_outline_ai, uploaded_images, created_at, updated_at</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}