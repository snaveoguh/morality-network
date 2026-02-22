"use client";

import {
  type SourceBias,
  type BiasRating,
  BIAS_LABELS,
  BIAS_COLORS,
  BIAS_SHORT,
  FACTUALITY_LABELS,
  FACTUALITY_COLORS,
  biasToPosition,
} from "@/lib/bias";
import { useState } from "react";

// ============================================================================
// COMPACT BIAS PILL — shows on every tile
// ============================================================================

export function BiasPill({ bias }: { bias: SourceBias }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide"
        style={{
          backgroundColor: `${BIAS_COLORS[bias.bias]}15`,
          color: BIAS_COLORS[bias.bias],
          border: `1px solid ${BIAS_COLORS[bias.bias]}30`,
        }}
      >
        {BIAS_SHORT[bias.bias]}
        <span
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: FACTUALITY_COLORS[bias.factuality] }}
          title={`Factuality: ${FACTUALITY_LABELS[bias.factuality]}`}
        />
      </span>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 shadow-xl">
          {/* Source name */}
          <p className="mb-1.5 text-[10px] font-bold text-white">
            {bias.name}
          </p>

          {/* Mini bias spectrum */}
          <div className="mb-1.5">
            <div className="flex h-1.5 overflow-hidden rounded-full">
              {(
                [
                  "far-left",
                  "left",
                  "lean-left",
                  "center",
                  "lean-right",
                  "right",
                  "far-right",
                ] as BiasRating[]
              ).map((rating) => (
                <div
                  key={rating}
                  className="flex-1 transition-opacity"
                  style={{
                    backgroundColor: BIAS_COLORS[rating],
                    opacity: rating === bias.bias ? 1 : 0.15,
                  }}
                />
              ))}
            </div>
            <p className="mt-0.5 text-center text-[9px] font-medium" style={{ color: BIAS_COLORS[bias.bias] }}>
              {BIAS_LABELS[bias.bias]}
            </p>
          </div>

          {/* Factuality */}
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-zinc-400">Factuality</span>
            <span style={{ color: FACTUALITY_COLORS[bias.factuality] }}>
              {FACTUALITY_LABELS[bias.factuality]}
            </span>
          </div>

          {/* Ownership */}
          {bias.ownership && (
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-zinc-400">Owner</span>
              <span className="text-zinc-300">{bias.ownership}</span>
            </div>
          )}

          {/* Funding */}
          {bias.fundingModel && (
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-zinc-400">Funding</span>
              <span className="capitalize text-zinc-300">
                {bias.fundingModel}
              </span>
            </div>
          )}

          {/* Country */}
          {bias.country && (
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-zinc-400">Country</span>
              <span className="text-zinc-300">{bias.country}</span>
            </div>
          )}

          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-zinc-700 bg-zinc-900" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FULL BIAS BAR — ground.news style distribution bar
// For showing how multiple sources cover a story
// ============================================================================

interface BiasBarProps {
  sources: SourceBias[];
  compact?: boolean;
}

export function BiasBar({ sources, compact = false }: BiasBarProps) {
  if (sources.length === 0) return null;

  const segments: BiasRating[] = [
    "far-left", "left", "lean-left", "center", "lean-right", "right", "far-right",
  ];

  // Count sources per bias rating
  const counts: Record<BiasRating, number> = {
    "far-left": 0, "left": 0, "lean-left": 0,
    "center": 0,
    "lean-right": 0, "right": 0, "far-right": 0,
  };
  for (const s of sources) counts[s.bias]++;

  // Group into Left / Center / Right for the label
  const leftCount = counts["far-left"] + counts["left"] + counts["lean-left"];
  const centerCount = counts["center"];
  const rightCount = counts["lean-right"] + counts["right"] + counts["far-right"];
  const total = sources.length;

  const leftPct = Math.round((leftCount / total) * 100);
  const centerPct = Math.round((centerCount / total) * 100);
  const rightPct = 100 - leftPct - centerPct;

  return (
    <div className={compact ? "" : "rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"}>
      {!compact && (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Source Bias Distribution · {total} sources
        </p>
      )}

      {/* The bar */}
      <div className="flex h-2 overflow-hidden rounded-full">
        {segments.map((seg) => {
          const pct = (counts[seg] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg}
              className="transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: BIAS_COLORS[seg],
                minWidth: pct > 0 ? "3px" : 0,
              }}
              title={`${BIAS_LABELS[seg]}: ${counts[seg]} source${counts[seg] !== 1 ? "s" : ""}`}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="mt-1 flex justify-between text-[9px]">
        <span style={{ color: BIAS_COLORS["left"] }}>
          {leftPct > 0 ? `${leftPct}% L` : ""}
        </span>
        <span style={{ color: BIAS_COLORS["center"] }}>
          {centerPct > 0 ? `${centerPct}% C` : ""}
        </span>
        <span style={{ color: BIAS_COLORS["right"] }}>
          {rightPct > 0 ? `${rightPct}% R` : ""}
        </span>
      </div>
    </div>
  );
}
