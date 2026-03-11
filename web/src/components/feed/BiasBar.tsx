"use client";

import {
  type SourceBias,
  type BiasRating,
  BIAS_LABELS,
  BIAS_SHORT,
  FACTUALITY_LABELS,
} from "@/lib/bias";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// ============================================================================
// Grayscale bias color map — dark = extreme, light = center
// ============================================================================

const BIAS_GRAYS: Record<BiasRating, string> = {
  "far-left": "#1A1A1A",
  "left": "#3A3A3A",
  "lean-left": "#6A6A6A",
  "center": "#AAAAAA",
  "lean-right": "#6A6A6A",
  "right": "#3A3A3A",
  "far-right": "#1A1A1A",
};

const FACTUALITY_GRAYS: Record<string, string> = {
  "very-high": "#1A1A1A",
  "high": "#4A4A4A",
  "mostly-factual": "#6A6A6A",
  "mixed": "#8A8A8A",
  "low": "#AAAAAA",
  "very-low": "#C8C0B0",
};

// ============================================================================
// COMPACT BIAS PILL — shows on every tile
// ============================================================================

export function BiasPill({ bias }: { bias: SourceBias }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
    });
  }, []);

  useEffect(() => {
    if (showTooltip) {
      updatePosition();
    }
  }, [showTooltip, updatePosition]);

  return (
    <div
      ref={pillRef}
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center gap-1 border px-1 py-px font-mono text-[8px] font-bold uppercase tracking-widest"
        style={{
          borderColor: BIAS_GRAYS[bias.bias],
          color: BIAS_GRAYS[bias.bias],
        }}
      >
        {BIAS_SHORT[bias.bias]}
        <span
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: FACTUALITY_GRAYS[bias.factuality] || "#8A8A8A" }}
          title={`Factuality: ${FACTUALITY_LABELS[bias.factuality]}`}
        />
      </span>

      {/* Tooltip — rendered via portal to escape overflow-hidden parents */}
      {showTooltip && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-44 border-2 border-[var(--rule)] bg-[var(--paper)] p-2.5 shadow-md"
            style={{
              top: pos.top - 8,
              left: pos.left,
              transform: "translateY(-100%)",
            }}
          >
            {/* Source name */}
            <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
              {bias.name}
            </p>

            {/* Mini bias spectrum — grayscale */}
            <div className="mb-1.5">
              <div className="flex h-1.5 overflow-hidden">
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
                      backgroundColor: BIAS_GRAYS[rating],
                      opacity: rating === bias.bias ? 1 : 0.15,
                    }}
                  />
                ))}
              </div>
              <p className="mt-0.5 text-center font-mono text-[8px] font-bold uppercase tracking-wider" style={{ color: BIAS_GRAYS[bias.bias] }}>
                {BIAS_LABELS[bias.bias]}
              </p>
            </div>

            {/* Factuality */}
            <div className="flex items-center justify-between font-mono text-[8px] text-[var(--ink-faint)]">
              <span>Factuality</span>
              <span className="font-bold text-[var(--ink-light)]">
                {FACTUALITY_LABELS[bias.factuality]}
              </span>
            </div>

            {/* Ownership */}
            {bias.ownership && (
              <div className="flex items-center justify-between font-mono text-[8px] text-[var(--ink-faint)]">
                <span>Owner</span>
                <span className="text-[var(--ink-light)]">{bias.ownership}</span>
              </div>
            )}

            {/* Funding */}
            {bias.fundingModel && (
              <div className="flex items-center justify-between font-mono text-[8px] text-[var(--ink-faint)]">
                <span>Funding</span>
                <span className="capitalize text-[var(--ink-light)]">
                  {bias.fundingModel}
                </span>
              </div>
            )}

            {/* Country */}
            {bias.country && (
              <div className="flex items-center justify-between font-mono text-[8px] text-[var(--ink-faint)]">
                <span>Country</span>
                <span className="text-[var(--ink-light)]">{bias.country}</span>
              </div>
            )}

            {/* Arrow */}
            <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 border-b-2 border-r-2 border-[var(--rule)] bg-[var(--paper)]" />
          </div>,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// FULL BIAS BAR — grayscale distribution
// ============================================================================

interface BiasDigest {
  insight: string;
  source: "ai" | "computed";
  avgFactuality: string;
  tilt: number;
  tiltLabel: string;
}

interface BiasBarProps {
  sources: SourceBias[];
  compact?: boolean;
  digest?: BiasDigest;
}

export function BiasBar({ sources, compact = false, digest }: BiasBarProps) {
  if (sources.length === 0) return null;

  const segments: BiasRating[] = [
    "far-left", "left", "lean-left", "center", "lean-right", "right", "far-right",
  ];

  const counts: Record<BiasRating, number> = {
    "far-left": 0, "left": 0, "lean-left": 0,
    "center": 0,
    "lean-right": 0, "right": 0, "far-right": 0,
  };
  for (const s of sources) counts[s.bias]++;

  const leftCount = counts["far-left"] + counts["left"] + counts["lean-left"];
  const centerCount = counts["center"];
  const rightCount = counts["lean-right"] + counts["right"] + counts["far-right"];
  const total = sources.length;

  const leftPct = Math.round((leftCount / total) * 100);
  const centerPct = Math.round((centerCount / total) * 100);
  const rightPct = 100 - leftPct - centerPct;

  return (
    <div className={compact ? "" : "border border-[var(--rule-light)] bg-[var(--paper)] p-3"}>
      {!compact && (
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Source Bias Distribution &middot; {total} sources
          </p>
          {digest && (
            <span className="font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
              {digest.source === "ai" ? "AI" : "AUTO"} &middot; {digest.avgFactuality} factuality
            </span>
          )}
        </div>
      )}

      {/* The bar — grayscale */}
      <div className="flex h-1.5 overflow-hidden">
        {segments.map((seg) => {
          const pct = (counts[seg] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg}
              className="transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: BIAS_GRAYS[seg],
                minWidth: pct > 0 ? "3px" : 0,
              }}
              title={`${BIAS_LABELS[seg]}: ${counts[seg]} source${counts[seg] !== 1 ? "s" : ""}`}
            />
          );
        })}
      </div>

      {/* Labels — monochrome */}
      <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>{leftPct > 0 ? `${leftPct}% L` : ""}</span>
        <span>{centerPct > 0 ? `${centerPct}% C` : ""}</span>
        <span>{rightPct > 0 ? `${rightPct}% R` : ""}</span>
      </div>

      {/* AI bias insight */}
      {digest && !compact && (
        <p className="mt-2 border-t border-[var(--rule-light)] pt-1.5 font-mono text-[8px] italic leading-relaxed text-[var(--ink-light)]">
          {digest.insight}
        </p>
      )}
    </div>
  );
}
