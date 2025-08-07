import { create } from "zustand";

type OverlayMode = "hidden" | "welcome" | "full";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface IntiOverlayState {
  overlayMode: OverlayMode;
  hasUserInteracted: boolean;
  isFullscreen: boolean;
  canInstall: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  setOverlayMode: (mode: OverlayMode) => void;
  setHasUserInteracted: (interacted: boolean) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setCanInstall: (canInstall: boolean) => void;
  setDeferredPrompt: (prompt: BeforeInstallPromptEvent | null) => void;
  reset: () => void;
}

export const useIntiOverlayStore = create<IntiOverlayState>((set, get) => ({
  // Start with hidden mode - let the page component decide when to show welcome
  overlayMode: "hidden",
  hasUserInteracted: false,
  isFullscreen: false,
  canInstall: false,
  deferredPrompt: null,
  
  setOverlayMode: (mode) => {
    console.log("[IntiOverlayStore] Setting overlay mode from", get().overlayMode, "to:", mode);
    set({ overlayMode: mode });
  },
  
  setHasUserInteracted: (interacted) => {
    console.log("[IntiOverlayStore] Setting user interacted:", interacted);
    set({ hasUserInteracted: interacted });
  },
  
  setIsFullscreen: (fullscreen) => {
    console.log("[IntiOverlayStore] Setting fullscreen:", fullscreen);
    set({ isFullscreen: fullscreen });
  },
  
  setCanInstall: (canInstall) => {
    console.log("[IntiOverlayStore] Setting can install:", canInstall);
    set({ canInstall: canInstall });
  },
  
  setDeferredPrompt: (prompt) => {
    console.log("[IntiOverlayStore] Setting deferred prompt:", prompt);
    set({ deferredPrompt: prompt });
  },
  
  reset: () => {
    console.log("[IntiOverlayStore] Resetting overlay store");
    set({ 
      overlayMode: "hidden", 
      hasUserInteracted: false,
      isFullscreen: false,
      canInstall: false,
      deferredPrompt: null
    });
  },
}));