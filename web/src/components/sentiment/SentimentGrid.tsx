"use client";

import { useState } from "react";
import { SentimentBar } from "./SentimentBar";
import { sentimentLabel, trendArrow, type TopicSentimentResult } from "@/lib/sentiment";

type Filter = "all" | "asset" | "thematic";

interface SentimentGridProps {
  topics: TopicSentimentResult[];
}

const SIGNAL_LABELS: Record<string, string> = {
  sentimentScore: "Sentiment",
  volumeScore: "Velocity",
  contradictionScore: "Consensus",
  marketScore: "Market",
  biasSpreadScore: "Bias Spread",
};

export function SentimentGrid({ topics }: SentimentGridProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    filter === "all"
      ? topics
      : topics.filter((t) => t.category === filter);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "asset", label: "Assets" },
    { value: "thematic", label: "Thematic" },
  ];

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-0 font-mono text-[9px] uppercase tracking-wider">
          {filters.map((f, i) => (
            <span key={f.value} className="flex items-center">
              {i > 0 && (
                <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              )}
              <button
                onClick={() => setFilter(f.value)}
                className={`transition-colors ${
                  filter === f.value
                    ? "font-bold text-[var(--ink)] underline underline-offset-2"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {f.label}
              </button>
            </span>
          ))}
        </div>
        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          {filtered.length} topics
        </span>
      </div>

      {/* Topic grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered
          .sort((a, b) => b.articleCount - a.articleCount)
          .map((topic) => (
            <TopicCard key={topic.slug} topic={topic} />
          ))}
      </div>
    </div>
  );
}

function TopicCard({ topic }: { topic: TopicSentimentResult }) {
  const arrow = trendArrow(topic.trend);
  const label = sentimentLabel(topic.score);
  const trendColor =
    topic.trend > 3
      ? "text-[var(--ink)]"
      : topic.trend < -3
        ? "text-[var(--accent-red)]"
        : "text-[var(--ink-faint)]";

  return (
    <div className="border border-[var(--rule-light)] p-4">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{topic.symbol}</span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            {topic.displayName}
          </span>
        </div>
        <span
          className={`font-mono text-[9px] uppercase tracking-wider ${
            topic.category === "asset"
              ? "text-[var(--ink)]"
              : "text-[var(--ink-faint)]"
          }`}
        >
          {topic.category}
        </span>
      </div>

      {/* Score + trend */}
      <div className="mb-2 flex items-end gap-2 sm:gap-3">
        <span className="font-headline text-xl leading-none text-[var(--ink)] sm:text-2xl">
          {topic.score}
        </span>
        {topic.trend !== 0 && (
          <span className={`font-mono text-[10px] font-bold sm:text-xs ${trendColor}`}>
            {arrow} {topic.trend > 0 ? "+" : ""}{topic.trend}
          </span>
        )}
        <span className="ml-auto font-body-serif text-[10px] italic text-[var(--ink-faint)] sm:text-xs">
          {label}
        </span>
      </div>

      {/* Bar */}
      <SentimentBar score={topic.score} height={5} className="mb-2" />

      {/* Meta */}
      <div className="flex items-center gap-2 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span>{topic.eventCount ?? topic.articleCount} {topic.eventCount ? "events" : "articles"}</span>
        {topic.eventCount ? (
          <>
            <span>&middot;</span>
            <span>{topic.articleCount} articles</span>
          </>
        ) : null}
        <span>&middot;</span>
        <span>{topic.sourceCount} sources</span>
      </div>

      <div className="mt-3 space-y-2 border-t border-[var(--rule-light)] pt-3">
        <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
          Signal Breakdown
        </p>
        {Object.entries(SIGNAL_LABELS).map(([key, signalLabel]) => {
          const value = topic.signals[key as keyof typeof topic.signals];
          if (value === null || value === undefined) return null;
          const numValue = typeof value === "number" ? value : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-20 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                {signalLabel}
              </span>
              <div className="flex-1">
                <div className="relative h-[4px] w-full bg-[var(--paper-dark)]">
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--ink)]"
                    style={{ width: `${numValue}%` }}
                  />
                </div>
              </div>
              <span className="w-6 text-right font-mono text-[8px] font-bold text-[var(--ink-light)]">
                {Math.round(numValue)}
              </span>
            </div>
          );
        })}

        {topic.topSources.length > 0 && (
          <div className="mt-2">
            <p className="font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
              Top sources: {topic.topSources.join(" / ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
