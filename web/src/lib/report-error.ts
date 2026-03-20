/**
 * Centralized error reporting utility.
 *
 * Server-side: logs with structured [module:context] prefix.
 * Client-side: also dispatches a CustomEvent so the NotificationProvider
 * can pick it up and show a toast — no React context import needed.
 */

import type { NotificationEventDetail } from "./notification-types";

interface ReportOptions {
  /** Push a user-visible notification (default: false). */
  notify?: boolean;
  /** Log level (default: "warn"). */
  severity?: "warn" | "error";
  /** Notification title override (default: derived from context). */
  title?: string;
}

export function reportError(
  context: string,
  error: unknown,
  options: ReportOptions = {},
): void {
  const { notify = false, severity = "warn", title } = options;

  const msg =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  const tag = `[${context}]`;

  if (severity === "error") {
    console.error(tag, msg, error);
  } else {
    console.warn(tag, msg);
  }

  // Bridge to React notification system via CustomEvent (client only).
  if (notify && typeof window !== "undefined") {
    const detail: NotificationEventDetail = {
      type: severity === "error" ? "error" : "warning",
      title: title ?? context.split(":").pop() ?? "Error",
      message: msg.slice(0, 200),
    };

    window.dispatchEvent(
      new CustomEvent("pooter:notification", { detail }),
    );
  }
}

/** Shorthand: warn-level, no notification. */
export function reportWarn(context: string, error: unknown): void {
  reportError(context, error, { severity: "warn" });
}
