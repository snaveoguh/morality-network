"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  PooterNotification,
  NotificationEventDetail,
  PooterMood,
  NotificationType,
} from "@/lib/notification-types";
import { moodForType } from "@/lib/notification-types";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface NotificationContextValue {
  /** Currently visible toasts (max 5, FIFO). */
  notifications: PooterNotification[];
  /** Rolling history (last 50). */
  history: PooterNotification[];
  /** Current pooter mood derived from latest notification. */
  pooterMood: PooterMood;
  /** Push a new notification. */
  push: (n: Omit<PooterNotification, "id" | "timestamp">) => void;
  /** Dismiss a single notification by id. */
  dismiss: (id: string) => void;
  /** Dismiss all visible notifications. */
  dismissAll: () => void;
  /** Whether the history panel is open. */
  panelOpen: boolean;
  /** Toggle history panel. */
  setPanelOpen: (open: boolean) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within <NotificationProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 5;
const MAX_HISTORY = 50;
const DEFAULT_DISMISS_MS = 5_000;
const MOOD_REVERT_MS = 4_000;

let idCounter = 0;
function nextId(): string {
  return `pn-${Date.now()}-${++idCounter}`;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<PooterNotification[]>([]);
  const [history, setHistory] = useState<PooterNotification[]>([]);
  const [pooterMood, setPooterMood] = useState<PooterMood>("idle");
  const [panelOpen, setPanelOpen] = useState(false);

  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ------- push -------
  const push = useCallback(
    (input: Omit<PooterNotification, "id" | "timestamp">) => {
      const notif: PooterNotification = {
        ...input,
        id: nextId(),
        timestamp: Date.now(),
      };

      // Update visible queue (cap at MAX_VISIBLE — drop oldest).
      setNotifications((prev) => {
        const next = [...prev, notif];
        if (next.length > MAX_VISIBLE) return next.slice(-MAX_VISIBLE);
        return next;
      });

      // Update history.
      setHistory((prev) => {
        const next = [notif, ...prev];
        if (next.length > MAX_HISTORY) return next.slice(0, MAX_HISTORY);
        return next;
      });

      // Set pooter mood.
      const mood = moodForType(notif.type);
      setPooterMood(mood);

      // Revert mood after delay.
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
      moodTimerRef.current = setTimeout(() => {
        setPooterMood("idle");
      }, MOOD_REVERT_MS);

      // Auto-dismiss timer.
      const dismissMs = notif.autoDismissMs ?? DEFAULT_DISMISS_MS;
      if (dismissMs > 0) {
        const timer = setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
          dismissTimersRef.current.delete(notif.id);
        }, dismissMs);
        dismissTimersRef.current.set(notif.id, timer);
      }
    },
    [],
  );

  // ------- dismiss -------
  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    setNotifications([]);
    for (const timer of dismissTimersRef.current.values()) clearTimeout(timer);
    dismissTimersRef.current.clear();
  }, []);

  // ------- CustomEvent bridge (for reportError / non-React code) -------
  useEffect(() => {
    function onCustomEvent(e: Event) {
      const detail = (e as CustomEvent<NotificationEventDetail>).detail;
      if (!detail?.type || !detail?.message) return;
      push(detail);
    }

    window.addEventListener("pooter:notification", onCustomEvent);
    return () => window.removeEventListener("pooter:notification", onCustomEvent);
  }, [push]);

  // ------- cleanup on unmount -------
  useEffect(() => {
    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
      for (const timer of dismissTimersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        history,
        pooterMood,
        push,
        dismiss,
        dismissAll,
        panelOpen,
        setPanelOpen,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
