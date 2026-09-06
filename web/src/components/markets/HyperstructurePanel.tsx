"use client";

import { useEffect, useState } from "react";

/**
 * The flywheel, measured in public: 24h inference burn vs 24h realized
 * agent PnL. No spin — the verdict line reads NOT SELF-FUNDING until the
 * ratio actually crosses 1.
 */

interface HyperstructureData {
  generatedAt: number;
  windowHours: number;
  inference: {
    estimatedCostUsd: number;
    invocations: number;
    totalTokens: number;
  } | null;
  trading: {
    window: { closedTrades: number; realizedPnlUsd: number; unpricedCloses?: number } | null;
    book: { closedTrades: number; realizedPnlUsd: number; unpricedCloses?: number } | null;
    openPositions: number | null;
  } | null;
  flywheel: {
    windowNetUsd: number;
    selfFundingRatio: number | null;
    selfFunding: boolean;
  } | null;
}

const POLL_MS = 60_000;

function usd(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function HyperstructurePanel() {
  const [data, setData] = useState<HyperstructureData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/hyperstructure");
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as HyperstructureData;
        if (mounted) {
          setData(json);
          setFailed(false);
        }
      } catch {
        if (mounted) setFailed(true);
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const burn = data?.inference?.estimatedCostUsd ?? null;
  const pnl = data?.trading?.window?.realizedPnlUsd ?? null;
  const ratio = data?.flywheel?.selfFundingRatio ?? null;
  const selfFunding = data?.flywheel?.selfFunding ?? false;

  const verdict = !data
    ? failed
      ? "TELEMETRY UNREACHABLE"
      : "MEASURING..."
    : selfFunding
      ? "SELF-FUNDING"
      : "NOT SELF-FUNDING"; // the honest default while the loop is open

  const verdictColor = !data
    ? "text-[var(--ink-faint)]"
    : selfFunding
      ? "text-[var(--accent-green)]"
      : "text-[var(--accent-red)]";

  return (
    <section className="mb-8 border-2 border-[var(--ink)] bg-[var(--paper-dark)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-light)] px-4 py-2">
        <h3 className="font-headline text-lg text-[var(--ink)]">
          Hyperstructure
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          agent profit vs inference burn · {data?.windowHours ?? 24}h window ·
          live
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-[var(--rule-light)] sm:grid-cols-4">
        <div className="bg-[var(--paper-dark)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Inference burn
          </p>
          <p className="mt-1 font-headline text-2xl text-[var(--ink)]">
            {burn === null ? "—" : usd(burn)}
          </p>
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            {data?.inference
              ? `${data.inference.invocations.toLocaleString()} calls · ${(data.inference.totalTokens / 1_000_000).toFixed(1)}M tok`
              : "no telemetry"}
          </p>
        </div>

        <div className="bg-[var(--paper-dark)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Realized PnL
          </p>
          <p
            className={`mt-1 font-headline text-2xl ${
              pnl === null
                ? "text-[var(--ink)]"
                : pnl >= 0
                  ? "text-[var(--accent-green)]"
                  : "text-[var(--accent-red)]"
            }`}
          >
            {pnl === null ? "—" : usd(pnl)}
          </p>
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            {data?.trading?.window
              ? `${data.trading.window.closedTrades} closes · ${data.trading.openPositions ?? "—"} open` +
                (data.trading.window.unpricedCloses
                  ? ` · ${data.trading.window.unpricedCloses} unpriced`
                  : "")
              : "no closes in window"}
          </p>
        </div>

        <div className="bg-[var(--paper-dark)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Funding ratio
          </p>
          <p className="mt-1 font-headline text-2xl text-[var(--ink)]">
            {ratio === null ? "—" : `${ratio.toFixed(2)}×`}
          </p>
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            profit ÷ burn · 1.00× = loop closed
          </p>
        </div>

        <div className="bg-[var(--paper-dark)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Status
          </p>
          <p className={`mt-1 font-headline text-2xl ${verdictColor}`}>
            {verdict}
          </p>
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            book: {data?.trading?.book ? usd(data.trading.book.realizedPnlUsd) : "—"} over{" "}
            {data?.trading?.book?.closedTrades ?? "—"} trades
          </p>
        </div>
      </div>
    </section>
  );
}
