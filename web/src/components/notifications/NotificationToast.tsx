"use client";

import { useCallback, useState } from "react";
import type { PooterNotification } from "@/lib/notification-types";

// ---------------------------------------------------------------------------
// Border colour per type
// ---------------------------------------------------------------------------
const BORDER_COLORS: Record<PooterNotification["type"], string> = {
  info: "border-l-[var(--ink-light)]",
  warning: "border-l-amber-600",
  error: "border-l-[var(--accent-red)]",
  signal: "border-l-[var(--ink)]",
};

const TYPE_LABELS: Record<PooterNotification["type"], string> = {
  info: "INFO",
  warning: "WARN",
  error: "ERROR",
  signal: "SIGNAL",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  notification: PooterNotification;
  onDismiss: (id: string) => void;
}

export function NotificationToast({ notification, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(notification.id), 280);
  }, [notification.id, onDismiss]);

  const borderColor = BORDER_COLORS[notification.type];
  const label = TYPE_LABELS[notification.type];

  const directionArrow =
    notification.signalData?.direction === "bullish"
      ? "↑"
      : notification.signalData?.direction === "bearish"
        ? "↓"
        : "";

  return (
    <div
      className={`${exiting ? "toast-exit" : "toast-enter"} flex w-72 items-start gap-2 border-l-4 ${borderColor} bg-[var(--paper)] px-3 py-2.5 shadow-lg lg:w-80`}
      role="alert"
    >
      <div className="min-w-0 flex-1">
        {/* Type label + timestamp */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink-light)]">
            {label}
          </span>
          {notification.signalData && (
            <span className="font-mono text-[9px] font-bold text-[var(--ink)]">
              {notification.signalData.symbol} {directionArrow}
            </span>
          )}
          <span className="ml-auto font-mono text-[8px] text-[var(--ink-faint)]">
            {formatTime(notification.timestamp)}
          </span>
        </div>

        {/* Title */}
        <p className="mt-0.5 font-mono text-[10px] font-bold leading-tight text-[var(--ink)]">
          {notification.title}
        </p>

        {/* Message */}
        <p className="mt-0.5 font-mono text-[9px] leading-snug text-[var(--ink-light)]">
          {notification.message}
        </p>

        {/* Signal badge */}
        {notification.signalData?.suggestedAction && (
          <span className="mt-1 inline-block border border-[var(--ink-faint)] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink)]">
            {notification.signalData.suggestedAction}
          </span>
        )}

        {/* Action */}
        {notification.action && (
          <button
            onClick={() => {
              if (notification.action?.href) {
                window.open(notification.action.href, "_blank");
              }
              notification.action?.onClick?.();
              handleDismiss();
            }}
            className="mt-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent-red)]"
          >
            {notification.action.label}
          </button>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="shrink-0 pt-0.5 font-mono text-[10px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
