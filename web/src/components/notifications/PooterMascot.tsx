"use client";

import { Component, type ReactNode, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useNotification } from "@/providers/NotificationProvider";

// Lazy-load the Three.js canvas in a SEPARATE dynamic import.
// If @react-three/fiber fails to load at module level, this dynamic
// import fails gracefully (renders nothing) while the rest of
// PooterMascot still renders the 2D fallback.
const Pooter3DCanvas = dynamic(
  () => import("./Pooter3DCanvas").then((m) => m.Pooter3DCanvas),
  { ssr: false, loading: () => null },
);

// ---------------------------------------------------------------------------
// Error boundary — catches Three.js WebGL runtime crashes
// ---------------------------------------------------------------------------
interface EBProps { children: ReactNode; fallback: ReactNode }
interface EBState { hasError: boolean }

class ThreeErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) {
    console.warn("[PooterMascot] 3D failed, using 2D fallback:", err.message);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ---------------------------------------------------------------------------
// 2D fallback icon (shared by mobile + error states)
// ---------------------------------------------------------------------------
function Pooter2D() {
  return (
    <div className="pointer-events-none flex h-12 w-12 items-center justify-center border-2 border-[var(--rule)] bg-[var(--paper)] shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pooter-icon.svg" alt="pooter" width={32} height={32} className="opacity-80" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speech bubble
// ---------------------------------------------------------------------------
function SpeechBubble({ message, visible }: { message: string; visible: boolean }) {
  if (!visible || !message) return null;
  return (
    <div
      className="absolute -left-2 bottom-full mb-2 w-max max-w-[160px] -translate-x-full animate-[fadeIn_0.3s_ease-out] rounded border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-serif text-[10px] italic text-[var(--ink)] shadow-md"
      style={{ animationFillMode: "forwards" }}
    >
      {message}
      {/* Triangle pointer */}
      <div className="absolute -bottom-1 right-3 h-2 w-2 rotate-45 border-b border-r border-[var(--rule)] bg-[var(--paper)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main mascot — fixed bottom-right
// ---------------------------------------------------------------------------

/**
 * Pooter mascot — fixed bottom-right corner.
 * Desktop (≥1024px): 48×48 Three.js Canvas with kawaii 3D printer bot.
 * Mobile  (<1024px): 48×48 2D fallback.
 * Occasionally shows sassy messages telling you to go outside.
 */
export function PooterMascot() {
  const { pooterMood, panelOpen, setPanelOpen, notifications } = useNotification();
  const unreadCount = notifications.length;
  const [sassyMessage, setSassyMessage] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(false);

  const handleSassyMessage = useCallback((msg: string) => {
    setSassyMessage(msg);
    setBubbleVisible(true);
  }, []);

  // Auto-hide speech bubble after 5 seconds
  useEffect(() => {
    if (!bubbleVisible) return;
    const timer = setTimeout(() => setBubbleVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [bubbleVisible, sassyMessage]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <SpeechBubble message={sassyMessage} visible={bubbleVisible} />
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="relative block cursor-pointer"
        aria-label={panelOpen ? "Close notification panel" : "Open notification panel"}
        title="pooter notifications"
      >
        {/* Desktop: Three.js 3D Canvas (lazy loaded, with error boundary) */}
        <div className="hidden lg:block">
          <ThreeErrorBoundary fallback={<Pooter2D />}>
            <Pooter3DCanvas mood={pooterMood} onSassyMessage={handleSassyMessage} />
          </ThreeErrorBoundary>
        </div>

        {/* Mobile: 2D fallback icon */}
        <div className="lg:hidden">
          <Pooter2D />
        </div>

        {/* Notification count badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-[var(--accent-red)] font-mono text-[8px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
