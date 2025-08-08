"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from './components/IntiCommunicationProvider';
import { useIntiOverlayStore } from './stores/useIntiOverlayStore';

export const IntiWelcome: React.FC = () => {
  const { overlayMode, setOverlayMode, setHasUserInteracted } = useIntiOverlayStore();
  // The useAuth hook now gets its state directly from the WebSocket connection
  const { authenticated, user, loading } = useAuth();
  
  const [isVisible, setIsVisible] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const rippleIdRef = useRef(0);

  // Show welcome overlay with fade-in effect
  useEffect(() => {
    if (overlayMode === "welcome") {
      const timer = setTimeout(() => setIsVisible(true), 200);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [overlayMode]);

  const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const newRipple = {
      id: rippleIdRef.current++,
      x: centerX,
      y: centerY,
    };

    setRipples(prev => [...prev, newRipple]);

    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 2000);
  };

  const handleIntiClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Create ripple effect
    createRipple(event);
    
    // The button is disabled while loading, so we can be sure of the auth state here.
    console.log(`[IntiWelcome] Clicked. Authenticated: ${authenticated}`);
    setHasUserInteracted(true);

    if (authenticated) {
      console.log('[IntiWelcome] User is authenticated. Hiding overlay.');
      
      // Unlock audio context (required for audio playback)
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          await audioContext.resume();
        }
      } catch {
        console.log("Audio context resume failed - will retry on next interaction");
      }

      // Slight delay for ripple effect before transition
      setTimeout(() => {
        setOverlayMode('hidden');
      }, 300);
    } else {
      console.log('[IntiWelcome] User is not authenticated. Redirecting to Replit invite page.');
      const replitInviteUrl = `https://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/invite?returnUrl=${encodeURIComponent('https://inti.intellipedia.ai')}`;
      window.location.href = replitInviteUrl;
    }
  };

  if (overlayMode !== 'welcome') {
    return null;
  }

  return (
    <>
      {/* Overlay Background with proper transparency */}
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm transition-opacity duration-500" />

      {/* Ripple Effects */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="fixed pointer-events-none z-[10001]"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="w-4 h-4 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full animate-ping opacity-75" />
          <div className="absolute inset-0 w-4 h-4 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full animate-pulse" />
        </div>
      ))}

      {/* Welcome Content */}
      <div className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center transition-all duration-500 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}>
        
        {/* Personalized Welcome Text */}
        <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-2 text-center">
          {loading ? 'Welcome to Inti' : `Welcome to Inti${user?.displayName ? `, ${user.displayName}` : ''}!`}
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-white/90 drop-shadow-md mb-8 text-center">
          I&apos;m your conversational AI assistant.
        </p>

        {/* Inti Logo with Solar Frame - Centered and Scaled */}
        <div className="relative mb-8 flex flex-col items-center justify-center">
          {/* Solar Frame Glow */}
          <div className="absolute inset-0 inti-welcome-glow rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 opacity-40 blur-xl scale-150" style={{ zIndex: 1 }}></div>
          
          {/* Main Logo Button */}
          <button
            onClick={handleIntiClick}
            disabled={loading}
            className="inti-welcome-pulse relative w-48 h-48 bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 rounded-full flex items-center justify-center shadow-2xl hover:shadow-3xl transition-all duration-300 ease-in-out transform hover:scale-105 cursor-pointer border-4 border-white/40 backdrop-blur-sm disabled:bg-gray-500 disabled:cursor-wait disabled:scale-95"
            aria-label="Start creating with Inti"
            style={{ zIndex: 2 }}
          >
            {/* Inti Logo */}
            <img
              src="/inti-logo.png"
              alt="Inti"
              className="w-44 h-44 object-contain drop-shadow-lg"
              style={{ maxWidth: "99%", maxHeight: "99%" }}
              onError={(e) => {
                // Fallback to SVG if PNG fails
                const img = e.currentTarget as HTMLImageElement;
                img.src = "/inti-logo.svg";
                img.onerror = () => {
                  // Final fallback to text
                  img.style.display = "none";
                  const fallback = img.nextElementSibling as HTMLElement;
                  if (fallback) {
                    fallback.style.display = "block";
                  }
                };
              }}
            />
            {/* Fallback text */}
            <span
              className="text-white text-4xl font-bold drop-shadow-lg"
              style={{ display: "none" }}
            >
              INTI
            </span>
            {/* Inner highlight */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
          </button>
          
          {/* Floating particles */}
          <div className="absolute -top-4 -left-4 w-2 h-2 bg-yellow-300 rounded-full animate-bounce opacity-60" style={{ animationDelay: "0s" }} />
          <div className="absolute -top-2 -right-6 w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce opacity-70" style={{ animationDelay: "0.5s" }} />
          <div className="absolute -bottom-6 -left-2 w-1 h-1 bg-yellow-500 rounded-full animate-bounce opacity-50" style={{ animationDelay: "1s" }} />
          <div className="absolute -bottom-4 -right-4 w-2 h-2 bg-amber-300 rounded-full animate-bounce opacity-60" style={{ animationDelay: "1.5s" }} />
        </div>

        {/* Call to Action */}
        <div className="text-xl text-white/90 drop-shadow-md mb-4 text-center">
          {loading ? 'Connecting...' : (authenticated ? 'Click to begin our conversation!' : 'Click to authenticate and start!')}
        </div>

        {/* Feature highlights */}
        <div className="mt-2 text-white/60 text-sm drop-shadow-sm text-center">
          Voice-first • Distraction-free • Collaborative
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes inti-welcome-fade-in {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes inti-welcome-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }

        @keyframes inti-welcome-glow {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.6;
          }
        }

        .inti-welcome-fade-in {
          animation: inti-welcome-fade-in 0.8s ease-out;
        }

        .inti-welcome-pulse {
          animation: inti-welcome-pulse 3s ease-in-out infinite;
        }

        .inti-welcome-glow {
          animation: inti-welcome-glow 4s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};

export default IntiWelcome;