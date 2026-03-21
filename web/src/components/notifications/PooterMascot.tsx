"use client";

import { Component, type ReactNode } from "react";
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
// Main mascot — fixed bottom-right
// ---------------------------------------------------------------------------

/**
 * Pooter mascot — fixed bottom-right corner.
 * Desktop (≥1024px): 96×96 Three.js Canvas with 3D printer bot.
 * Mobile  (<1024px): 48×48 2D fallback.
 * If Three.js fails to load or crashes, 2D fallback on all viewports.
 */
export function PooterMascot() {
  const { pooterMood, panelOpen, setPanelOpen, notifications } = useNotification();
  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="relative block cursor-pointer"
        aria-label={panelOpen ? "Close notification panel" : "Open notification panel"}
        title="pooter notifications"
      >
        {/* Desktop: Three.js 3D Canvas (lazy loaded, with error boundary) */}
        <div className="hidden lg:block">
          <ThreeErrorBoundary fallback={<Pooter2D />}>
            <Pooter3DCanvas mood={pooterMood} />
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
