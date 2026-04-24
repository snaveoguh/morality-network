"use client";

/**
 * CrossVenueSpreads — Compact dashboard band showing live Polymarket arb opportunities
 * detected by polypooter. Read-only surface; execution lives in the polypooter service.
 *
 * Polls /api/predictions/arb every 60s (opportunities don't churn faster than scanner cadence).
 */

import { useEffect, useState } from "react";

interface ArbMarketLeg {
  marketId: string;
  question: string;
  tokenId: string;
  side: "YES" | "NO";
  bestAsk: number;
  availableSize: number;
}

interface ArbOpportunity {
  id: string;
  strategy: "completeness" | "multi-outcome" | "stale-odds";
  eventTitle: string;
  markets: ArbMarketLeg[];
  totalCost: number;
  guaranteedReturn: number;
  spreadPct: number;
  netProfitPct: number;
  estimatedFeePct: number;
  liquidity: number;
  detectedAt: number;
}

interface ArbResponse {
  count: number;
  lastScanAt: string | null;
  opportunities: ArbOpportunity[];
}

const POLL_INTERVAL_MS = 60_000;
const MAX_ROWS = 6;

function formatPct(pct: number): string {
  return `${(pct * 100).toFixed(2)}%`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function strategyBadge(strategy: string): { label: string; cls: string } {
  switch (strategy) {
    case "completeness":
      return { label: "BIN", cls: "border-[var(--ink)] text-[var(--ink)]" };
    case "multi-outcome":
      return { label: "MULTI", cls: "border-amber-600 text-amber-600" };
    default:
      return { label: "STALE", cls: "border-[var(--ink-faint)] text-[var(--ink-faint)]" };
  }
}

export default function CrossVenueSpreads() {
  const [data, setData] = useState<ArbResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/predictions/arb", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 503 ? "Polypooter service not configured" : `Error ${res.status}`);
            setLoading(false);
          }
          return;
        }
        const json = (await res.json()) as ArbResponse;
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fetch failed");
          setLoading(false);
        }
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const opps = (data?.opportunities ?? []).slice(0, MAX_ROWS);
  const bestSpread = opps.length > 0 ? Math.max(...opps.map((o) => o.netProfitPct)) : 0;

  return (
    <section className="border border-[var(--rule-light)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Cross-Venue Spreads
          </h2>
          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Polymarket arb opportunities · scan {timeAgo(data?.lastScanAt ?? null)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-headline text-base text-[var(--ink)]">{data?.count ?? 0}</div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Live
            </div>
          </div>
          <div className="text-right">
            <div className="font-headline text-base text-green-700">
              {bestSpread > 0 ? formatPct(bestSpread) : "—"}
            </div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Best
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-4 text-center font-mono text-[9px] text-[var(--ink-faint)]">
          Loading spreads…
        </p>
      ) : error ? (
        <p className="py-4 text-center font-mono text-[9px] text-[var(--ink-faint)]">
          {error}
        </p>
      ) : opps.length === 0 ? (
        <p className="py-4 text-center font-mono text-[9px] text-[var(--ink-faint)]">
          No arb opportunities right now. Spreads close fast.
        </p>
      ) : (
        <div className="border-t border-[var(--rule-light)]">
          <div className="flex items-center gap-2 border-b border-[var(--rule-light)] px-1 py-1.5">
            <span className="w-[50%] font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-[var(--ink-faint)]">
              Event
            </span>
            <span className="w-[10%] text-center font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-[var(--ink-faint)]">
              Type
            </span>
            <span className="w-[14%] text-right font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-[var(--ink-faint)]">
              Cost
            </span>
            <span className="w-[14%] text-right font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-green-700">
              Net Profit
            </span>
            <span className="w-[12%] text-right font-mono text-[7px] font-bold uppercase tracking-[0.15em] text-[var(--ink-faint)]">
              Liq
            </span>
          </div>
          {opps.map((opp) => {
            const badge = strategyBadge(opp.strategy);
            return (
              <div
                key={opp.id}
                className="flex items-center gap-2 border-b border-[var(--rule-light)] px-1 py-1.5 last:border-b-0"
              >
                <div className="w-[50%] min-w-0">
                  <div className="truncate font-mono text-[10px] text-[var(--ink)]">
                    {opp.eventTitle}
                  </div>
                </div>
                <div className="w-[10%] text-center">
                  <span className={`inline-block border px-1 py-px font-mono text-[7px] uppercase tracking-wider ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="w-[14%] text-right font-mono text-[10px] text-[var(--ink)]">
                  ${opp.totalCost.toFixed(4)}
                </div>
                <div className="w-[14%] text-right font-mono text-[10px] font-bold text-green-700">
                  {formatPct(opp.netProfitPct)}
                </div>
                <div className="w-[12%] text-right font-mono text-[9px] text-[var(--ink-faint)]">
                  ${opp.liquidity >= 1000 ? `${(opp.liquidity / 1000).toFixed(0)}k` : opp.liquidity.toFixed(0)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        Detection only · execution gated behind polypooter service · see /predictions/arb for full report
      </p>
    </section>
  );
}
