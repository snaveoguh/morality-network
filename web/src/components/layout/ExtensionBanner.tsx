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
    <div className="next-panel border-b border-black/30 bg-[var(--chrome-dark)] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] small-caps">
            Pooter Extension Detected
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConnect}
            className="bevel-button bg-[var(--chrome-mid)] h-5 px-3 text-[10px] font-bold text-[var(--ink)]"
          >
            Connect Extension Wallet
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[11px] text-white opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
