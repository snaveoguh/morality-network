/**
 * Shared notification types used by the NotificationProvider,
 * toast UI components, 3D pooter mascot, and smart alert hooks.
 */

export type NotificationType = "info" | "warning" | "error" | "signal";

export type PooterMood = "idle" | "excited" | "alert" | "thinking";

export interface PooterNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  /** Auto-dismiss delay in ms. Default 5000. Set 0 for manual dismiss only. */
  autoDismissMs?: number;
  /** Optional action button on the toast. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Extra data for signal-type notifications. */
  signalData?: {
    symbol: string;
    direction: "bullish" | "bearish";
    score: number;
    suggestedAction?: string;
  };
}

/** Payload shape for the `pooter:notification` CustomEvent bridge. */
export type NotificationEventDetail = Omit<PooterNotification, "id" | "timestamp">;

/** Map notification types to pooter moods. */
export function moodForType(type: NotificationType): PooterMood {
  switch (type) {
    case "signal":
      return "excited";
    case "error":
      return "alert";
    case "warning":
      return "alert";
    case "info":
    default:
      return "idle";
  }
}
