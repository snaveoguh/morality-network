"use client";

import type { EntityScore } from "@/lib/entity-scorer";

function ScoreBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const displayColor = color ?? (value >= 70 ? "var(--ink)" : value >= 40 ? "var(--ink-faint)" : "var(--accent-red)");

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        {label}
      </span>
      <div className="flex-1">
        <div className="h-2 w-full bg-[var(--paper-dark)]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: displayColor }}
          />
        </div>
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-[var(--ink)]">
        {value}/{max}
      </span>
    </div>
  );
}

function BiasIndicator({ tilt, label }: { tilt: number; label: string }) {
  // Map -3..+3 to 0%..100%
  const pct = ((tilt + 3) / 6) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        Bias
      </span>
      <div className="relative flex-1">
        <div className="flex justify-between font-mono text-[7px] text-[var(--ink-faint)]">
          <span>L</span>
          <span>C</span>
          <span>R</span>
        </div>
        <div className="relative mt-0.5 h-1.5 w-full bg-[var(--paper-dark)]">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--rule)]" />
          {/* Position dot */}
          <div
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ink)]"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[9px] text-[var(--ink)]">
        {label}
      </span>
    </div>
  );
}

function RiskFlags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="border border-[var(--accent-red)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--accent-red)]"
        >
          {flag}
        </span>
      ))}
    </div>
  );
}

export function EntityScoreCard({ score }: { score: EntityScore }) {
  const typeLabel = score.entityType.toUpperCase();
  const chainLabel = score.chain ? ` (${score.chain.toUpperCase()})` : "";

  return (
    <div className="border border-[var(--rule)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-bold text-[var(--ink)]">
            {score.metadata?.name
              ? `${score.metadata.name as string} (${score.metadata.symbol as string ?? ""})`
              : score.identifier.length > 50
              ? `${score.identifier.slice(0, 20)}...${score.identifier.slice(-15)}`
              : score.identifier}
          </p>
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {score.entityHash.slice(0, 14)}...
          </p>
        </div>
        <span className="shrink-0 border border-[var(--rule)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          {typeLabel}{chainLabel}
        </span>
      </div>

      {/* Score bars */}
      <div className="space-y-2">
        <ScoreBar label="Morality" value={score.moralityScore} />
        {score.factualityScore !== null && (
          <ScoreBar label="Factuality" value={score.factualityScore} />
        )}
        {score.biasTilt !== null && score.biasLabel && (
          <BiasIndicator tilt={score.biasTilt} label={score.biasLabel} />
        )}
        <ScoreBar
          label="Risk"
          value={score.riskScore}
          color={score.riskScore >= 50 ? "var(--accent-red)" : score.riskScore >= 25 ? "var(--ink-faint)" : "var(--ink)"}
        />
      </div>

      {/* Risk flags */}
      <RiskFlags flags={score.riskFlags} />

      {/* AI reasoning */}
      <div className="border-t border-[var(--rule-light)] pt-2">
        <p className="font-body-serif text-[12px] italic leading-relaxed text-[var(--ink)]">
          &ldquo;{score.reasoning}&rdquo;
        </p>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          Scored by {score.scoredBy} · {new Date(score.scoredAt).toLocaleTimeString()}
        </span>
        <button className="border border-[var(--rule-light)] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)] hover:border-[var(--rule)] hover:text-[var(--ink)]">
          Rate Onchain
        </button>
      </div>
    </div>
  );
}
