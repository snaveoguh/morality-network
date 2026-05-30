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
    <div className="fixed bottom-4 left-4 z-50 flex max-w-xs items-start gap-2.5 rounded-lg border border-[var(--rule-light)] border-l-4 border-l-[var(--accent-red)] bg-[var(--paper)] px-4 py-3 shadow-lg">
      {/* Red pulse dot */}
      <span className="relative mt-1 flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-red)]" />
      </span>

      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-red)]">
          High-Risk Beta
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--ink-light)]">
          This platform is experimental. Smart contracts are unaudited. Use at your own risk.
        </p>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-[13px] leading-none text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
