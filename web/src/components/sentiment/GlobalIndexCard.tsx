"use client";

import { useState, useEffect } from "react";
import { SentimentBar } from "./SentimentBar";
import {
  sentimentLabel,
  trendArrowPercent,
  formatPercentTrend,
} from "@/lib/sentiment";

type TrendRange = "1D" | "3D" | "1W" | "1M";
const RANGES: TrendRange[] = ["1D", "3D", "1W", "1M"];

interface BoundaryEntry {
  g: number;
  s: Record<string, number>;
}

interface GlobalIndexCardProps {
  globalScore: number;
  globalTrend: number;
  feedItemsScanned: number;
  eventCount?: number;
  topicCount: number;
  generatedAt: string;
  sourceRegistrySize?: number;
  queuedCrawlTargets?: number;
}

export function GlobalIndexCard({
  globalScore,
  globalTrend,
  feedItemsScanned,
  eventCount,
  topicCount,
  generatedAt,
  sourceRegistrySize,
  queuedCrawlTargets,
}: GlobalIndexCardProps) {
  const label = sentimentLabel(globalScore);

  // ── Time-range tabs ──────────────────────────────────────────────────────
  const [range, setRange] = useState<TrendRange>("1D");
  const [boundaries, setBoundaries] = useState<Record<
    TrendRange,
    BoundaryEntry | null
  > | null>(null);

  useEffect(() => {
    fetch("/api/sentiment/history")
      .then((res) => res.json())
      .then((data) => setBoundaries(data.boundaries))
      .catch(() => {});
  }, []);

  // Compute percentage trend for selected range
  const pastScore = boundaries?.[range]?.g ?? null;
  const pctTrend =
    pastScore !== null && pastScore !== 0
      ? ((globalScore - pastScore) / pastScore) * 100
      : null;

  const arrow = trendArrowPercent(pctTrend);
  const trendText = formatPercentTrend(pctTrend);

  const trendColor =
    pctTrend !== null && pctTrend > 1
      ? "text-[var(--ink)]"
      : pctTrend !== null && pctTrend < -1
        ? "text-[var(--accent-red)]"
        : "text-[var(--ink-faint)]";

  const formattedTime = new Date(generatedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="border border-[var(--rule-light)] p-6">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--ink-faint)]">
        Global Morality Index
      </p>

      <div className="flex items-end gap-4">
        <span className="font-headline text-5xl leading-none text-[var(--ink)]">
          {globalScore}
        </span>
        <div className="mb-1">
          <p className="font-body-serif text-lg italic text-[var(--ink-light)]">
            {label}
          </p>
          <p className={`font-mono text-sm font-bold ${trendColor}`}>
            {arrow} {trendText}
          </p>
        </div>
      </div>

      {/* Time-range tabs */}
      <div className="mt-3 flex items-center gap-0 font-mono text-[9px] uppercase tracking-wider">
        {RANGES.map((r, i) => (
          <span key={r} className="flex items-center">
            {i > 0 && (
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
            )}
            <button
              onClick={() => setRange(r)}
              className={`transition-colors ${
                range === r
                  ? "font-bold text-[var(--ink)] underline underline-offset-2"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {r}
            </button>
          </span>
        ))}
      </div>

      <SentimentBar
        score={globalScore}
        height={8}
        showLabels
        className="mt-4"
      />

      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>
          {eventCount ?? feedItemsScanned}{" "}
          {eventCount ? "events" : "articles"} scanned
        </span>
        {eventCount ? (
          <>
            <span>&middot;</span>
            <span>{feedItemsScanned} raw articles</span>
          </>
        ) : null}
        <span>&middot;</span>
        <span>{topicCount} topics tracked</span>
        {sourceRegistrySize ? (
          <>
            <span>&middot;</span>
            <span>{sourceRegistrySize} sources in registry</span>
          </>
        ) : null}
        {queuedCrawlTargets !== undefined ? (
          <>
            <span>&middot;</span>
            <span>{queuedCrawlTargets} crawl targets queued</span>
          </>
        ) : null}
        <span>&middot;</span>
        <span>Updated {formattedTime}</span>
      </div>
    </div>
  );
}
