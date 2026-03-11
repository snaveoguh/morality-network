"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================================
// INSTALL PROMPT — PWA "Add to Home Screen" banner
//
// Shows a newspaper-style bottom banner on mobile devices prompting install.
// - Android: intercepts `beforeinstallprompt` for native install flow
// - iOS: shows manual instructions (Share → Add to Home Screen)
// - Dismissible, remembers choice in localStorage for 14 days
// - Hidden when already installed as PWA
// ============================================================================

const DISMISS_KEY = "pooter-install-dismissed";
const DISMISS_DAYS = 14;

/** Kawaii printer icon — inline SVG for zero network requests */
function PooterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      style={{ imageRendering: "pixelated" }}
    >
      {/* Paper */}
      <rect x="16" y="4" width="32" height="16" fill="#E8E4DC" stroke="#4A4A4A" strokeWidth="1" />
      <rect x="20" y="7" width="16" height="1" fill="#C8C0B0" />
      <rect x="20" y="10" width="24" height="1" fill="#C8C0B0" />
      <rect x="20" y="13" width="20" height="1" fill="#C8C0B0" />
      {/* Body */}
      <rect x="8" y="18" width="48" height="32" rx="3" fill="#D4D0C8" stroke="#4A4A4A" strokeWidth="1.5" />
      <rect x="14" y="22" width="36" height="22" rx="2" fill="#E8E4DC" stroke="#8A8A8A" strokeWidth="0.5" />
      {/* Eyes */}
      <rect x="22" y="27" width="5" height="5" rx="0.5" fill="#1A1A1A" />
      <rect x="23" y="28" width="2" height="2" fill="#E8E4DC" />
      <rect x="37" y="27" width="5" height="5" rx="0.5" fill="#1A1A1A" />
      <rect x="38" y="28" width="2" height="2" fill="#E8E4DC" />
      {/* Mouth */}
      <path d="M28 37 Q32 40 36 37" fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" />
      {/* Feed slot */}
      <rect x="12" y="18" width="40" height="3" rx="1" fill="#8A8A8A" />
      {/* Tray */}
      <rect x="12" y="50" width="40" height="6" rx="2" fill="#C8C0B0" stroke="#4A4A4A" strokeWidth="1" />
      {/* Status light */}
      <circle cx="46" cy="24" r="2" fill="#6B8E6B" stroke="#4A4A4A" strokeWidth="0.5" />
    </svg>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Don't show if already running as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((navigator as unknown as { standalone?: boolean }).standalone) return;

    // Don't show if recently dismissed
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return;
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const isiOS = /iPhone|iPad|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isiOS);

    // On Android/desktop, listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // On iOS, just show manual instructions after 3 second delay
    if (isiOS) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[var(--rule)] bg-[var(--paper)] px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <PooterIcon className="h-10 w-10 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
            Get pooter world
          </p>
          {isIOS ? (
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Tap{" "}
              <svg viewBox="0 0 24 24" className="inline-block h-3 w-3 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7-7 7 7" />
                <rect x="4" y="17" width="16" height="2" rx="1" />
              </svg>{" "}
              Share &rsaquo; Add to Home Screen
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Install as app for the full experience
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            >
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="px-1 py-1 font-mono text-[10px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
