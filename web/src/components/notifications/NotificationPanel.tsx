"use client";

import { useNotification } from "@/providers/NotificationProvider";

const TYPE_ICONS: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  error: "✕",
  signal: "◆",
};

/**
 * Expandable history panel — triggered by clicking the pooter mascot.
 * Shows the last 50 notifications with relative timestamps.
 */
export function NotificationPanel() {
  const { history, panelOpen, setPanelOpen, dismissAll } = useNotification();

  if (!panelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => setPanelOpen(false)}
      />

      {/* Panel */}
      <div className="fixed bottom-28 right-4 z-50 w-80 border-2 border-[var(--rule)] bg-[var(--paper)] shadow-xl lg:bottom-28 lg:right-4 max-lg:inset-x-4 max-lg:bottom-4 max-lg:w-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-3 py-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
            Notifications
          </span>
          <div className="flex gap-3">
            {history.length > 0 && (
              <button
                onClick={dismissAll}
                className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              className="font-mono text-[12px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
        </div>

        {/* History list */}
        <div className="max-h-[400px] overflow-y-auto">
          {history.length === 0 ? (
            <p className="px-3 py-6 text-center font-mono text-[9px] text-[var(--ink-faint)]">
              No notifications yet.
            </p>
          ) : (
            history.map((n) => (
              <div
                key={n.id}
                className="flex gap-2 border-b border-[var(--rule-light)] px-3 py-2 last:border-b-0"
              >
                <span className="mt-0.5 shrink-0 font-mono text-[10px] text-[var(--ink-light)]">
                  {TYPE_ICONS[n.type] ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[9px] font-bold text-[var(--ink)]">
                      {n.title}
                    </span>
                    <span className="shrink-0 font-mono text-[8px] text-[var(--ink-faint)]">
                      {relativeTime(n.timestamp)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[8px] leading-snug text-[var(--ink-light)]">
                    {n.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
