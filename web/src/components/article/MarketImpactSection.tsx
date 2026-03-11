"use client";

import type { MarketImpactAnalysis, MarketImpactTimeHorizon } from "@/lib/article";

interface MarketImpactSectionProps {
  impact: MarketImpactAnalysis;
}

const HORIZON_LABELS: Record<MarketImpactTimeHorizon, { short: string; label: string }> = {
  minutes: { short: "M", label: "Minutes" },
  hours:   { short: "H", label: "Hours" },
  days:    { short: "D", label: "Days" },
  weeks:   { short: "W", label: "Weeks" },
  months:  { short: "Mo", label: "Months" },
};

const ALL_HORIZONS: MarketImpactTimeHorizon[] = ["minutes", "hours", "days", "weeks", "months"];

function directionArrow(direction: string): { symbol: string; className: string } {
  switch (direction) {
    case "bullish":  return { symbol: "▲", className: "text-[var(--ink)]" };
    case "bearish":  return { symbol: "▼", className: "text-[var(--accent-red)]" };
    case "volatile": return { symbol: "◆", className: "text-[var(--ink-light)]" };
    case "neutral":  return { symbol: "—", className: "text-[var(--ink-faint)]" };
    default:         return { symbol: "·", className: "text-[var(--ink-faint)]" };
  }
}

function significanceColor(significance: number): string {
  if (significance >= 80) return "bg-[var(--accent-red)]";
  if (significance >= 60) return "bg-[var(--ink)]";
  if (significance >= 40) return "bg-[var(--ink-light)]";
  return "bg-[var(--ink-faint)]";
}

export function MarketImpactSection({ impact }: MarketImpactSectionProps) {
  const { significance, headline, affectedMarkets, transmissionMechanism, topicSlugs } = impact;

  return (
    <section className="mb-8 border-t-2 border-[var(--rule)] pt-4">
      {/* Header row */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Market Impact
        </h2>

        {/* Significance gauge */}
        <div className="flex flex-1 items-center gap-2">
          <div className="h-[3px] flex-1 bg-[var(--rule-light)]">
            <div
              className={`h-full transition-all ${significanceColor(significance)}`}
              style={{ width: `${significance}%` }}
            />
          </div>
          <span className="font-mono text-[9px] font-bold text-[var(--ink-faint)]">
            {significance}/100
          </span>
        </div>
      </div>

      {/* Headline */}
      {headline && (
        <p className="mb-3 font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)]">
          {headline}
        </p>
      )}

      {/* Transmission mechanism */}
      {transmissionMechanism && (
        <div className="mb-4 border-l-2 border-[var(--ink-faint)] pl-4">
          <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            Transmission
          </p>
          <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
            {transmissionMechanism}
          </p>
        </div>
      )}

      {/* Time horizon legend */}
      <div className="mb-3 flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span className="mr-1">Time Horizons:</span>
        {ALL_HORIZONS.map((h) => (
          <span key={h} title={HORIZON_LABELS[h].label} className="px-0.5">
            {HORIZON_LABELS[h].short}={HORIZON_LABELS[h].label}
          </span>
        ))}
      </div>

      {/* Market rows */}
      <div className="space-y-2">
        {affectedMarkets.map((market, i) => {
          const arrow = directionArrow(market.direction);
          return (
            <div
              key={i}
              className="flex items-start gap-2 border-b border-[var(--rule-light)] pb-2 last:border-0"
            >
              {/* Direction arrow */}
              <span className={`mt-0.5 font-mono text-sm font-bold ${arrow.className}`}>
                {arrow.symbol}
              </span>

              {/* Asset info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                    {market.asset}
                  </span>
                  {market.ticker && (
                    <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                      {market.ticker}
                    </span>
                  )}
                  <span className="font-mono text-[8px] capitalize text-[var(--ink-faint)]">
                    {market.direction}
                  </span>
                </div>

                {/* Rationale */}
                {market.rationale && (
                  <p className="mt-0.5 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
                    {market.rationale}
                  </p>
                )}

                {/* Time horizon pills */}
                <div className="mt-1.5 flex gap-1">
                  {ALL_HORIZONS.map((h) => {
                    const active = market.timeHorizons.includes(h);
                    return (
                      <span
                        key={h}
                        title={HORIZON_LABELS[h].label}
                        className={`inline-block px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase ${
                          active
                            ? "bg-[var(--ink)] text-[var(--paper)]"
                            : "bg-[var(--rule-light)] text-[var(--ink-faint)]"
                        }`}
                      >
                        {HORIZON_LABELS[h].short}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Confidence */}
              <span className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">
                {Math.round(market.confidence * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Topic slugs */}
      {topicSlugs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {topicSlugs.map((slug) => (
            <span
              key={slug}
              className="border border-[var(--rule)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]"
            >
              {slug}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
