// Fixed App component with proper overlay logic
// File: /frontend/src/app/page.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { IntiCommunicationProvider, useAuth } from './components/IntiCommunicationProvider';
import { useIntiOverlayStore } from './stores/useIntiOverlayStore';
import Unmute from './Unmute';
import { IntiWelcome } from './IntiWelcome';

// Loading component
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="text-white text-xl mb-4">Connecting to Inti...</div>
        <div className="text-gray-400 text-sm">Checking your authentication status</div>
      </div>
    </div>
  );
}

// Main PWA component
function IntiPWA() {
  const { user, loading, authenticated, error } = useAuth();
  const { overlayMode, setOverlayMode } = useIntiOverlayStore();
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize overlay logic once authentication is determined
  useEffect(() => {
    if (!loading && !hasInitialized) {
      console.log('[PWA] Initializing overlay logic');
      console.log('[PWA] User:', user);
      console.log('[PWA] Authenticated:', authenticated);
      console.log('[PWA] Current overlay mode:', overlayMode);
      
      const welcomeSeen = sessionStorage.getItem('inti-welcome-seen');
      console.log('[PWA] Welcome previously seen:', welcomeSeen);
      
      // Force show welcome overlay if not seen this session
      if (!welcomeSeen) {
        console.log('[PWA] First visit this session - showing welcome overlay');
        setOverlayMode('welcome');
      } else {
        console.log('[PWA] Welcome already seen this session - hiding overlay');
        setOverlayMode('hidden');
      }
      
      setHasInitialized(true);
    }
  }, [loading, hasInitialized, user, authenticated, overlayMode, setOverlayMode]);

  // Debug logging for overlay mode changes
  useEffect(() => {
    console.log('[PWA] Overlay mode is now:', overlayMode);
  }, [overlayMode]);

  // Show loading state while checking authentication
  if (loading) {
    console.log('[PWA] Rendering loading screen');
    return <LoadingScreen />;
  }

  // Show error state if there's a connection error (but allow manual override)
  if (error && !authenticated && !hasInitialized) {
    console.log('[PWA] Rendering error screen with manual overlay option');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">Connection Error</div>
          <div className="text-gray-400 text-sm mb-4">{error}</div>
          <div className="text-gray-500 text-xs mb-4">
            You can still use Inti, but authentication features may not work.
          </div>
          <button 
            onClick={() => {
              console.log('[PWA] Manual overlay trigger from error screen');
              sessionStorage.removeItem('inti-welcome-seen');
              setOverlayMode('welcome');
              setHasInitialized(true);
            }}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            Continue to Inti
          </button>
        </div>
      </div>
    );
  }

  console.log('[PWA] Rendering main interface with overlay mode:', overlayMode);

  return (
    <div className="min-h-screen bg-background text-gray-800" style={{background: 'var(--background)'}}>
      {/* Debug panel (remove in production) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed top-4 left-4 z-[9999] bg-black/90 text-white text-xs p-3 rounded-md max-w-sm border border-white/20">
          <div className="font-bold mb-2">Debug Info:</div>
          <div>Overlay: <span className="text-yellow-400">{overlayMode}</span></div>
          <div>Loading: <span className="text-blue-400">{loading.toString()}</span></div>
          <div>Auth: <span className="text-green-400">{authenticated.toString()}</span></div>
          <div>User: <span className="text-purple-400">{user?.displayName || 'None'}</span></div>
          <div>Welcome seen: <span className="text-orange-400">{sessionStorage.getItem('inti-welcome-seen') || 'No'}</span></div>
          <div>Initialized: <span className="text-cyan-400">{hasInitialized.toString()}</span></div>
          <div className="mt-2 space-x-2">
            <button 
              onClick={() => {
                console.log('[PWA] Debug: Force show welcome');
                sessionStorage.removeItem('inti-welcome-seen');
                setOverlayMode('welcome');
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
            >
              Show Welcome
            </button>
            <button 
              onClick={() => {
                console.log('[PWA] Debug: Force hide overlay');
                setOverlayMode('hidden');
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
            >
              Hide
            </button>
          </div>
        </div>
      )}

      {/* Unmute Interface */}
      <Unmute />
      
      {/* Inti Welcome Overlay */}
      <IntiWelcome />
    </div>
  );
}

// Root App component with provider
export default function App() {
  console.log('[PWA] App component rendered');
  return (
    <IntiCommunicationProvider>
      <IntiPWA />
    </IntiCommunicationProvider>
  );
}