"use client";

import { useCallback, useEffect, useRef } from "react";
import { useNotification } from "@/providers/NotificationProvider";

/**
 * Polls /api/markets every 60s and detects rapid price moves.
 * Fires a notification when any asset moves >3% between snapshots.
 * Deduplicates: max one alert per symbol per direction per 5-min window.
 */

interface Quote {
  symbol: string;
  price: number | null;
  change24h: number | null;
}

interface Snapshot {
  quotes: Quote[];
  ts: number;
}

const POLL_MS = 60_000;
const MOVE_THRESHOLD = 0.03; // 3%
const DEDUP_WINDOW_MS = 300_000; // 5 minutes

export function useMarketAlerts() {
  const { push } = useNotification();
  const historyRef = useRef<Snapshot[]>([]);
  const firedRef = useRef<Set<string>>(new Set());

  const checkMoves = useCallback(
    (newSnapshot: Snapshot) => {
      const prev = historyRef.current;
      if (prev.length === 0) {
        historyRef.current = [newSnapshot];
        return;
      }

      // Compare against oldest snapshot in window (up to 3 min ago)
      const oldest = prev[0];
      const now = Date.now();
      const bucket = Math.floor(now / DEDUP_WINDOW_MS);

      for (const quote of newSnapshot.quotes) {
        if (!quote.price) continue;

        const oldQuote = oldest.quotes.find((q) => q.symbol === quote.symbol);
        if (!oldQuote?.price) continue;

        const pctChange = (quote.price - oldQuote.price) / oldQuote.price;
        const absPct = Math.abs(pctChange);

        if (absPct >= MOVE_THRESHOLD) {
          const direction = pctChange > 0 ? "bullish" : "bearish";
          const dedupKey = `${quote.symbol}-${direction}-${bucket}`;

          if (!firedRef.current.has(dedupKey)) {
            firedRef.current.add(dedupKey);

            const arrow = direction === "bullish" ? "↑" : "↓";
            const sign = pctChange > 0 ? "+" : "";
            const pctStr = `${sign}${(pctChange * 100).toFixed(1)}%`;

            push({
              type: "signal",
              title: `${quote.symbol} ${arrow} ${pctStr}`,
              message: `${quote.symbol} moved ${pctStr} in the last ${Math.round((now - oldest.ts) / 1000)}s. Now $${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`,
              autoDismissMs: 8_000,
              signalData: {
                symbol: quote.symbol,
                direction,
                score: absPct * 100,
              },
              action: {
                label: "View Markets",
                href: "/markets",
              },
            });
          }
        }
      }

      // Maintain rolling window of 3 snapshots
      historyRef.current = [...prev, newSnapshot].slice(-3);
    },
    [push],
  );

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch("/api/markets");
        if (!res.ok) return;
        const data: Quote[] = await res.json();
        if (mounted) {
          checkMoves({ quotes: data, ts: Date.now() });
        }
      } catch {
        // Network hiccup — skip this poll
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);

    // Prune dedup set every 10 minutes
    const pruner = setInterval(() => {
      firedRef.current.clear();
    }, DEDUP_WINDOW_MS * 2);

    return () => {
      mounted = false;
      clearInterval(timer);
      clearInterval(pruner);
    };
  }, [checkMoves]);
}
