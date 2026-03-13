"use client";

import { SentimentBar } from "./SentimentBar";
import { sentimentLabel, trendArrow } from "@/lib/sentiment";

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
  const arrow = trendArrow(globalTrend);
  const trendColor =
    globalTrend > 3
      ? "text-[var(--ink)]"
      : globalTrend < -3
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
            {arrow} {globalTrend > 0 ? "+" : ""}{globalTrend}
          </p>
        </div>
      </div>

      <SentimentBar
        score={globalScore}
        height={8}
        showLabels
        className="mt-4"
      />

      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>{eventCount ?? feedItemsScanned} {eventCount ? "events" : "articles"} scanned</span>
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
