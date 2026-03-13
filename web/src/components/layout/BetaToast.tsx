"use client";

import { useState } from "react";

/**
 * Persistent red "high-risk beta" toaster — bottom-left corner.
 * Dismissible per session (not persisted across reloads).
 */
export function BetaToast() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-xs items-start gap-2 border-2 border-[var(--accent-red)] bg-[#1A0000] px-4 py-3 shadow-lg">
      {/* Red pulse dot */}
      <span className="relative mt-0.5 flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
      </span>

      <div className="min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">
          High-Risk Beta
        </p>
        <p className="mt-1 font-mono text-[9px] leading-snug text-red-400/80">
          This platform is experimental. Smart contracts are unaudited. Use at your own risk.
        </p>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 font-mono text-[10px] text-red-500/60 transition-colors hover:text-red-400"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
