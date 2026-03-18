"use client";

import type { AggregatedMarketSignal } from "@/lib/trading/signals";

interface SignalDashboardProps {
  signals: AggregatedMarketSignal[];
}

function directionArrow(direction: string): { symbol: string; className: string } {
  switch (direction) {
    case "bullish":  return { symbol: "▲", className: "text-[var(--ink)]" };
    case "bearish":  return { symbol: "▼", className: "text-[var(--accent-red)]" };
    default:         return { symbol: "·", className: "text-[var(--ink-faint)]" };
  }
}

function scoreBarWidth(score: number, maxScore: number): string {
  if (maxScore <= 0) return "0%";
  return `${Math.min(100, (score / maxScore) * 100)}%`;
}

function scoreColor(score: number): string {
  if (score >= 1.5) return "bg-[var(--ink)]";
  if (score >= 0.8) return "bg-[var(--ink-light)]";
  return "bg-[var(--ink-faint)]";
}

export function SignalDashboard({ signals }: SignalDashboardProps) {
  if (signals.length === 0) {
    return (
      <div className="border border-[var(--rule-light)] p-8 text-center">
        <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
          No qualifying signals. Editorials with market impact analysis will
          appear here as they are generated.
        </p>
      </div>
    );
  }

  const maxScore = Math.max(...signals.map((s) => s.score), 0.1);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 border-b border-[var(--rule)] pb-2">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Active Signals
        </h2>
        <span className="font-mono text-[9px] text-[var(--ink-faint)]">
          {signals.length} ticker{signals.length !== 1 ? "s" : ""}
        </span>
        <span className="ml-auto border border-[var(--ink)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink)]">
          Long-Only
        </span>
      </div>

      {/* Signal rows */}
      <div className="space-y-0">
        {signals.map((signal) => {
          const arrow = directionArrow(signal.direction);
          const isConflicted = signal.contradictionPenalty > 0.3;

          return (
            <div
              key={signal.symbol}
              className="flex items-start gap-3 border-b border-[var(--rule-light)] py-3 last:border-0"
            >
              {/* Direction arrow */}
              <span className={`mt-0.5 font-mono text-sm font-bold ${arrow.className}`}>
                {arrow.symbol}
              </span>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Ticker + direction + contradiction */}
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--ink)]">
                    {signal.symbol}
                  </span>
                  <span className="font-mono text-[9px] capitalize text-[var(--ink-faint)]">
                    {signal.direction}
                  </span>
                  {isConflicted && (
                    <span
                      className="font-mono text-[8px] text-[var(--accent-red)]"
                      title={`Contradiction penalty: ${Math.round(signal.contradictionPenalty * 100)}% — sources disagree on direction`}
                    >
                      &#9889; {Math.round(signal.contradictionPenalty * 100)}% conflict
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[9px] text-[var(--ink-faint)]">
                    from {signal.observations} article{signal.observations !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Score bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-[3px] flex-1 bg-[var(--rule-light)]">
                    <div
                      className={`h-full transition-all ${scoreColor(signal.score)}`}
                      style={{ width: scoreBarWidth(signal.score, maxScore) }}
                    />
                  </div>
                  <span className="font-mono text-[9px] font-bold text-[var(--ink)]">
                    {signal.score.toFixed(2)}
                  </span>
                </div>

                {/* Weight breakdown */}
                <div className="mt-1 flex gap-3 font-mono text-[8px] text-[var(--ink-faint)]">
                  <span>
                    Bull {signal.bullishWeight.toFixed(2)}
                  </span>
                  <span>
                    Bear {signal.bearishWeight.toFixed(2)}
                  </span>
                  <span>
                    Raw {signal.rawScore >= 0 ? "+" : ""}{signal.rawScore.toFixed(2)}
                  </span>
                </div>

                {/* Supporting claims */}
                {signal.supportingClaims.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {signal.supportingClaims.map((claim, i) => (
                      <p
                        key={i}
                        className="font-body-serif text-xs italic leading-relaxed text-[var(--ink-light)]"
                      >
                        &ldquo;{claim}&rdquo;
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 border-t border-[var(--rule)] pt-3">
        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Signals aggregated from editorial archive &middot; 48h exponential
          decay &middot; Contradiction-dampened &middot; Long-only
        </p>
      </div>
    </div>
  );
}
