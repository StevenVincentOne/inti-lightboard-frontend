import React, { useState, useEffect } from 'react';
import { useIntiOverlayStore } from './stores/useIntiOverlayStore';
import { useIntiCommunication } from './components/IntiCommunicationProvider';
import { useBackendServerUrl } from './useBackendServerUrl';
import { VoiceSample, Instructions, UnmuteConfig, DEFAULT_UNMUTE_CONFIG } from './UnmuteConfigurator';

interface IntiFloatingLogoProps {
  onNavigate?: (route: string) => void;
  onDownloadRecording?: () => void;
  recordingAvailable?: boolean;
  onConnect?: () => void;
  isConnected?: boolean;
  unmuteConfig?: UnmuteConfig;
  onConfigChange?: (config: UnmuteConfig) => void;
  onToggleChat?: () => void;
  onToggleIntiViz?: () => void;
  onToggleUserViz?: () => void;
  showIntiViz?: boolean;
  showUserViz?: boolean;
}

export const IntiFloatingLogo: React.FC<IntiFloatingLogoProps> = ({ 
  onNavigate, 
  onDownloadRecording, 
  recordingAvailable = false,
  onConnect,
  isConnected = false,
  unmuteConfig = DEFAULT_UNMUTE_CONFIG, // eslint-disable-line @typescript-eslint/no-unused-vars
  onConfigChange,
  onToggleChat,
  onToggleIntiViz,
  onToggleUserViz,
  showIntiViz = true,
  showUserViz = true
}) => {
  const { setOverlayMode, setIsFullscreen } = useIntiOverlayStore();
  const { user, sendMessage } = useIntiCommunication();
  const [showMenu, setShowMenu] = useState(false);
  const [showVoicesModal, setShowVoicesModal] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceSample | null>(null);
  const [voices, setVoices] = useState<VoiceSample[] | null>(null);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const backendServerUrl = useBackendServerUrl();
  // Removed unused login form state - now using direct Replit redirect

  // Fetch voices from backend
  useEffect(() => {
    const fetchVoices = async () => {
      if (backendServerUrl && !voices) {
        try {
          const response = await fetch(`${backendServerUrl}/v1/voices`);
          if (response.ok) {
            const voicesData = await response.json();
            setVoices(voicesData);
          }
        } catch (error) {
          console.error('Error fetching voices:', error);
        }
      }
    };
    fetchVoices();
  }, [backendServerUrl, voices]);

  // Utility function to get voice name
  const getVoiceName = (voice: VoiceSample) => {
    return (
      voice.name ||
      (voice.source.source_type === "freesound"
        ? voice.source.sound_instance.username
        : voice.source.path_on_server.slice(0, 10))
    );
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    console.log('Inti floating logo clicked');
    
    // Hold Shift+Click to reset welcome screen (for testing)
    if (e.shiftKey) {
      sessionStorage.removeItem('inti-welcome-seen');
      setOverlayMode('welcome');
      return;
    }
    
    // Always toggle menu on click
    if (showMenu) {
      setShowMenu(false);
    } else {
      setShowMenu(true);
    }
  };

  const handleLogout = () => {
    console.log('[IntiFloatingLogo] Redirecting to Replit invite page for logout...');
    setShowMenu(false);
    
    // Clear local PWA authentication data before redirecting
    localStorage.removeItem('inti_auth');
    sessionStorage.removeItem('inti_auth');
    localStorage.removeItem('inti-auth-token');
    sessionStorage.removeItem('inti-auth-token');
    
    // Direct to invite page - it handles logout via "Sign Out" button and redirects back
    const replitInviteUrl = 'https://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/invite?returnUrl=' + encodeURIComponent('https://inti.intellipedia.ai') + '&action=logout';
    
    // Open in same window to maintain PWA context
    window.location.href = replitInviteUrl;
  };

  const handleLogin = () => {
    console.log('[IntiFloatingLogo] Redirecting to Replit invite page for login...');
    setShowMenu(false);
    
    // Open Replit invite page with return URL to PWA - this handles login, registration, and invite codes
    const replitInviteUrl = 'https://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/invite?returnUrl=' + encodeURIComponent('https://inti.intellipedia.ai');
    
    // Open in same window to maintain PWA context
    window.location.href = replitInviteUrl;
  };

  // Removed handleCredentialLogin - now using direct Replit redirect

  const handleMenuAction = (action: string) => {
    setShowMenu(false);
    
    switch (action) {
      case 'voice':
        onNavigate?.('/');
        // Small delay to allow route change, then activate voice
        setTimeout(() => {
          setOverlayMode('full');
          setIsFullscreen(true);
        }, 100);
        break;
        
      case 'create':
        // Send message to Replit about navigation
        sendMessage('navigation', {
          route: '/create',
          source: 'inti.intellipedia.ai',
          user: user
        });
        // Navigate to create page
        window.location.href = 'https://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev/create';
        break;
        
      case 'replit':
        // Open Replit in new tab
        const replitUrl = 'https://6d3f40b3-1e49-4b09-85e4-36ff422ee88b-00-psvr1owg24vj.janeway.replit.dev';
        window.open(replitUrl, '_blank');
        break;

      case 'download':
        if (onDownloadRecording && recordingAvailable) {
          onDownloadRecording();
          console.log('Download recording initiated from menu');
        } else {
          console.log('Download recording not available or no handler provided');
        }
        break;

      case 'connect':
        if (onConnect) {
          onConnect();
          console.log(`${isConnected ? 'Disconnect' : 'Connect'} initiated from menu`);
        } else {
          console.log('Connect handler not provided');
        }
        break;

      case 'signin':
        handleLogin();
        break;

      case 'signout':
        handleLogout();
        break;

      case 'voices':
        console.log('Opening Voices modal');
        setShowVoicesModal(true);
        break;

      case 'chat':
        console.log('Toggle chat interface');
        if (onToggleChat) {
          onToggleChat();
        }
        break;

      case 'viz_inti':
        console.log('Toggle Inti visualizer');
        if (onToggleIntiViz) {
          onToggleIntiViz();
        }
        break;

      case 'viz_user':
        console.log('Toggle User visualizer');
        if (onToggleUserViz) {
          onToggleUserViz();
        }
        break;
    }
  };

  const handleVoiceSelect = (voice: VoiceSample) => {
    console.log('Selected voice:', voice);
    setSelectedVoice(voice);
  };

  const handleConnectWithVoice = () => {
    if (selectedVoice && onConfigChange) {
      console.log('Connecting with voice:', selectedVoice);
      
      // Create new config with selected voice and instructions
      const newInstructions: Instructions = customInstructions.trim() 
        ? { type: "constant", text: customInstructions.trim() }
        : selectedVoice.instructions || DEFAULT_UNMUTE_CONFIG.instructions;
      
      const newConfig: UnmuteConfig = {
        voice: selectedVoice.source.path_on_server,
        voiceName: getVoiceName(selectedVoice),
        instructions: newInstructions,
        isCustomInstructions: customInstructions.trim() !== ''
      };
      
      // Update config
      onConfigChange(newConfig);
      
      // Close modal and menu
      setShowVoicesModal(false);
      setShowMenu(false);
      
      // Trigger connection
      if (onConnect) {
        onConnect();
      }
      
      // Send the voice selection to the backend
      sendMessage('voice_selection', {
        voice: selectedVoice.source.path_on_server,
        voiceName: getVoiceName(selectedVoice),
        instructions: newInstructions,
        user: user
      });
    }
  };

  return (
    <>
      {/* Custom CSS for pulsating animation and columns */}
      <style>{`
        @keyframes soft-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }
        .floating-inti-logo {
          animation: soft-pulse 3s ease-in-out infinite;
        }
        .menu-fade-in {
          animation: menuFadeIn 0.2s ease-out;
        }
        @keyframes menuFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        /* Removed login dialog CSS - now using direct Replit redirect */
      `}</style>

      {/* Enhanced Navigation Menu with Columns */}
      {showMenu && (
        <div className="fixed bottom-24 right-6 z-50 menu-fade-in">
          <div className="bg-black/90 backdrop-blur-sm rounded-lg p-4 shadow-2xl border border-white/10" style={{ minWidth: '480px' }}>
            <div className="grid grid-cols-3 gap-4">
              
              {/* Left Column - Navigation */}
              <div className="space-y-2">
                <div className="text-xs text-white/60 mb-2 px-2">Navigation</div>
                <button
                  onClick={() => handleMenuAction('voice')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2"
                >
                  <span className="text-yellow-400">🎤</span>
                  Voice Interface
                </button>
                <button
                  onClick={() => handleMenuAction('create')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2"
                >
                  <span className="text-blue-400">✏️</span>
                  Create
                </button>
                <button
                  onClick={() => handleMenuAction('replit')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2"
                >
                  <span className="text-green-400">🌐</span>
                  Intellipedia
                </button>
              </div>

              {/* Right Column - Functions */}
              <div className="space-y-2">
                <div className="text-xs text-white/60 mb-2 px-2">Functions</div>
                
                {/* Connect/Disconnect Button */}
                <button
                  onClick={() => handleMenuAction('connect')}
                  className={`w-full text-left px-3 py-2 ${
                    isConnected 
                      ? 'text-white hover:bg-red-500/20 border border-red-500/30' 
                      : 'text-white hover:bg-green-500/20 border border-green-500/30'
                  } rounded-md transition-colors flex items-center gap-2`}
                >
                  <span className={isConnected ? 'text-red-400' : 'text-green-400'}>
                    {isConnected ? '⏹️' : '▶️'}
                  </span>
                  {isConnected ? 'Disconnect' : 'Connect'}
                </button>

                {/* Download Recording Button */}
                <button
                  onClick={() => handleMenuAction('download')}
                  disabled={!recordingAvailable}
                  className={`w-full text-left px-3 py-2 ${
                    recordingAvailable 
                      ? 'text-white hover:bg-white/10 cursor-pointer' 
                      : 'text-gray-500 cursor-not-allowed'
                  } rounded-md transition-colors flex items-center gap-2`}
                >
                  <span className="text-orange-400">💾</span>
                  Download Recording
                </button>

                {/* Viz Controls */}
                <button
                  onClick={() => handleMenuAction('viz_inti')}
                  className={`w-full text-left px-3 py-2 ${
                    showIntiViz 
                      ? 'text-white hover:bg-white/10 border border-yellow-500/30' 
                      : 'text-gray-500 hover:bg-white/10'
                  } rounded-md transition-colors flex items-center gap-2`}
                >
                  <span className="text-yellow-400">🎯</span>
                  Viz (Inti) {showIntiViz ? '●' : '○'}
                </button>

                <button
                  onClick={() => handleMenuAction('viz_user')}
                  className={`w-full text-left px-3 py-2 ${
                    showUserViz 
                      ? 'text-white hover:bg-white/10 border border-blue-500/30' 
                      : 'text-gray-500 hover:bg-white/10'
                  } rounded-md transition-colors flex items-center gap-2`}
                >
                  <span className="text-blue-400">👤</span>
                  Viz (Me) {showUserViz ? '●' : '○'}
                </button>

                {/* Spacer */}
                <div className="h-2"></div>

                {/* Sign In/Out Button */}
                <button
                  onClick={() => handleMenuAction(user ? 'signout' : 'signin')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2 border-t border-white/10 pt-3"
                >
                  <span className={user ? 'text-red-400' : 'text-blue-400'}>
                    {user ? '🚪' : '🔑'}
                  </span>
                  {user ? 'Sign Out' : 'Sign In'}
                </button>
              </div>

              {/* Third Column - Features */}
              <div className="space-y-2">
                <div className="text-xs text-white/60 mb-2 px-2">Features</div>
                
                {/* Chat Button */}
                <button
                  onClick={() => handleMenuAction('chat')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2"
                >
                  <span className="text-blue-400">💬</span>
                  Chat
                </button>
                
                {/* Voices Button */}
                <button
                  onClick={() => handleMenuAction('voices')}
                  className="w-full text-left px-3 py-2 text-white hover:bg-white/10 rounded-md transition-colors flex items-center gap-2"
                >
                  <span className="text-purple-400">🎭</span>
                  Voices
                </button>
              </div>
            </div>
            
            {/* User Info Section */}
            {user && (
              <div className="border-t border-white/10 mt-3 pt-2">
                <div className="px-3 py-1 text-xs text-white/60 text-center">
                  Signed in as {user.displayName || user.username}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voices Modal - Landscape Layout */}
      {showVoicesModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVoicesModal(false)}
          />
          
          {/* Modal Content - Landscape */}
          <div className="relative bg-black/90 backdrop-blur-sm rounded-lg p-6 shadow-2xl border border-white/10 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-white">Select Voice & Instructions</h2>
              <button
                onClick={() => setShowVoicesModal(false)}
                className="text-white/60 hover:text-white transition-colors text-xl"
              >
                ✕
              </button>
            </div>
            
            {/* Character/Voice Selection - Top Section */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-4">Choose Character Voice</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {voices && voices.map((voice) => (
                  <button
                    key={voice.source.path_on_server}
                    onClick={() => handleVoiceSelect(voice)}
                    className={`px-3 py-2 rounded-md transition-colors border text-sm font-medium ${
                      selectedVoice?.source.path_on_server === voice.source.path_on_server
                        ? 'border-green-400 bg-green-400/20 text-white' 
                        : 'border-white/20 text-white hover:bg-white/10'
                    }`}
                  >
                    {"/ " + getVoiceName(voice) + " /"}
                  </button>
                ))}
              </div>
              {!voices && (
                <div className="text-white/60 text-center py-4">Loading voices...</div>
              )}
            </div>
            
            {/* Instructions Section - Bottom Section */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-4">Custom Instructions (Optional)</h3>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder={selectedVoice?.instructions 
                  ? `Default: ${selectedVoice.instructions.type === 'constant' 
                      ? selectedVoice.instructions.text 
                      : 'Dynamic instructions for this character'}`
                  : 'Enter custom instructions for the character...'
                }
                className="w-full bg-black/50 text-white text-sm p-3 rounded-md border border-white/20 resize-none focus:border-white/40 focus:outline-none"
                rows={4}
              />
              <div className="text-xs text-white/60 mt-2">
                Leave blank to use the character&apos;s default instructions
              </div>
            </div>
            
            {/* Connect Button */}
            <div className="text-center">
              <button
                onClick={handleConnectWithVoice}
                disabled={!selectedVoice}
                className={`px-8 py-3 rounded-md transition-colors font-medium text-lg ${
                  selectedVoice 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                Connect with {selectedVoice ? getVoiceName(selectedVoice) : 'Character'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login dialog removed - using direct Replit redirect */}

      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={handleLogoClick}
          className={`floating-inti-logo relative transition-all duration-300 ease-in-out transform hover:scale-110 cursor-pointer ${showMenu ? 'scale-110' : ''}`}
          title="Open Inti menu"
        >
          {/* Glow effect behind logo - changes color based on connection state */}
          <div className={`absolute inset-0 w-16 h-16 bg-gradient-to-br ${
            isConnected 
              ? 'from-green-400 via-amber-500 to-yellow-600' 
              : 'from-yellow-400 via-amber-500 to-yellow-600'
          } rounded-full blur-lg opacity-60 ${
            isConnected ? 'shadow-green-400/30' : 'shadow-amber-400/30'
          }`} />
          
          {/* Inti Logo */}
          <img 
            src="/inti-logo.png" 
            alt="Inti" 
            className="relative w-16 h-16 object-contain drop-shadow-lg"
            onError={(e) => {
              // Fallback to text if image fails to load
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) {
                fallback.style.display = 'flex';
              }
            }}
          />
          {/* Fallback text */}
          <div 
            className={`relative w-16 h-16 bg-gradient-to-br ${
              isConnected 
                ? 'from-green-400 via-amber-500 to-yellow-600' 
                : 'from-yellow-400 via-amber-500 to-yellow-600'
            } rounded-full flex items-center justify-center shadow-lg`}
            style={{ display: 'none' }}
          >
            <span className="text-white text-2xl font-bold">I</span>
          </div>
        </button>
        
        {/* Connection Status Indicator */}
        {isConnected && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
        )}
        
        {/* Menu Indicator */}
        {showMenu && (
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full"></div>
        )}
      </div>
    </>
  );
};