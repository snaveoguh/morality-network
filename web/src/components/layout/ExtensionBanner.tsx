"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

/**
 * Extension connection banner.
 *
 * Detects the pooter world Chrome extension via:
 *   1. `window.pooterWallet` (EIP-1193 provider injected by content script)
 *   2. `POOTER_EXTENSION_PRESENT` postMessage from content script
 *
 * Shows a slim banner prompting the user to connect their extension wallet.
 * Hides when:
 *   - Wallet is already connected (via wagmi)
 *   - User dismisses it (localStorage remembers for 7 days)
 *   - Extension is not detected
 */

const DISMISS_KEY = "pooter-ext-banner-dismissed";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function ExtensionBanner() {
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  // Check on mount
  useEffect(() => {
    // Check localStorage dismissal
    if (isDismissed()) {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    // Check if provider already injected
    if ((window as any).pooterWallet) {
      setExtensionDetected(true);
    }

    // Listen for content script announcement
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === "POOTER_EXTENSION_PRESENT") {
        setExtensionDetected(true);
        // Handshake — tell the extension the site acknowledges it
        window.postMessage(
          { type: "POOTER_SITE_ACKNOWLEDGED", version: "2.0" },
          "*",
        );
      }
    }

    window.addEventListener("message", onMessage);

    // Also poll briefly — provider injection may race with React hydration
    const timer = setTimeout(() => {
      if ((window as any).pooterWallet) {
        setExtensionDetected(true);
      }
    }, 500);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }, []);

  const handleConnect = useCallback(() => {
    if (openConnectModal) openConnectModal();
  }, [openConnectModal]);

  // Don't show if: no extension, already connected, or dismissed
  if (!extensionDetected || isConnected || dismissed) return null;

  return (
    <div className="border-b border-[var(--rule)] bg-[var(--ink)] text-[var(--paper)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2">
          {/* Pulsing dot indicator */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>

          <span className="font-mono text-[9px] uppercase tracking-[0.16em]">
            pooter world extension detected
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConnect}
            className="h-5 border border-[var(--paper)] bg-[var(--paper)] px-3 font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-transparent hover:text-[var(--paper)]"
          >
            Connect Extension Wallet
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="font-mono text-[9px] text-[var(--paper)] opacity-50 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
