"use client";

import { useCallback, useEffect, useRef } from "react";
import { useNotification } from "@/providers/NotificationProvider";

/**
 * Polls /api/trading/signals every 120s and fires notifications when:
 * - A new high-conviction signal appears (score >= 1.5)
 * - A signal direction flips (bullish → bearish or vice versa)
 * - A new enter-long or enter-short suggested action appears
 */

interface Signal {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  suggestedAction?: string;
  narrative?: string;
}

interface SignalState {
  direction: "bullish" | "bearish";
  suggestedAction?: string;
}

const POLL_MS = 120_000; // 2 minutes
const HIGH_SCORE_THRESHOLD = 1.5;

export function useSignalAlerts() {
  const { push } = useNotification();
  const prevStates = useRef<Map<string, SignalState>>(new Map());
  const initialPoll = useRef(true);

  const checkSignals = useCallback(
    (signals: Signal[]) => {
      // Skip alerts on first poll (don't spam on page load)
      if (initialPoll.current) {
        initialPoll.current = false;
        for (const sig of signals) {
          prevStates.current.set(sig.symbol, {
            direction: sig.direction,
            suggestedAction: sig.suggestedAction,
          });
        }
        return;
      }

      for (const sig of signals) {
        const prev = prevStates.current.get(sig.symbol);

        // Direction flip
        if (prev && prev.direction !== sig.direction) {
          const arrow = sig.direction === "bullish" ? "↑" : "↓";
          push({
            type: "signal",
            title: `${sig.symbol} flipped ${sig.direction} ${arrow}`,
            message:
              sig.narrative ??
              `${sig.symbol} signal changed from ${prev.direction} to ${sig.direction}.`,
            autoDismissMs: 10_000,
            signalData: {
              symbol: sig.symbol,
              direction: sig.direction,
              score: sig.score,
              suggestedAction: sig.suggestedAction,
            },
          });
        }
        // New actionable signal
        else if (
          sig.suggestedAction &&
          (sig.suggestedAction === "enter-long" || sig.suggestedAction === "enter-short") &&
          prev?.suggestedAction !== sig.suggestedAction
        ) {
          const label = sig.suggestedAction === "enter-long" ? "ENTER LONG" : "ENTER SHORT";
          push({
            type: "signal",
            title: `${sig.symbol}: ${label}`,
            message:
              sig.narrative ?? `New ${label} signal for ${sig.symbol} (score: ${sig.score.toFixed(2)}).`,
            autoDismissMs: 10_000,
            signalData: {
              symbol: sig.symbol,
              direction: sig.direction,
              score: sig.score,
              suggestedAction: sig.suggestedAction,
            },
            action: {
              label: "View Signals",
              href: "/signals",
            },
          });
        }
        // High conviction new signal
        else if (!prev && sig.score >= HIGH_SCORE_THRESHOLD) {
          push({
            type: "signal",
            title: `High-conviction: ${sig.symbol}`,
            message:
              sig.narrative ??
              `New ${sig.direction} signal for ${sig.symbol} with score ${sig.score.toFixed(2)}.`,
            autoDismissMs: 8_000,
            signalData: {
              symbol: sig.symbol,
              direction: sig.direction,
              score: sig.score,
              suggestedAction: sig.suggestedAction,
            },
          });
        }

        // Update state
        prevStates.current.set(sig.symbol, {
          direction: sig.direction,
          suggestedAction: sig.suggestedAction,
        });
      }
    },
    [push],
  );

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch("/api/trading/signals");
        if (!res.ok) return;
        const data = await res.json();
        const signals: Signal[] = data?.signals ?? data ?? [];
        if (mounted && Array.isArray(signals)) {
          checkSignals(signals);
        }
      } catch {
        // Network hiccup — skip
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [checkSignals]);
}
