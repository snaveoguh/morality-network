import { fetchAllFeeds } from "@/lib/rss";
import {
  computeSentimentSnapshot,
  fetchMarketData,
  sentimentLabel,
} from "@/lib/sentiment";
import { GlobalIndexCard } from "@/components/sentiment/GlobalIndexCard";
import { SentimentGrid } from "@/components/sentiment/SentimentGrid";

export const revalidate = 300; // 5 min ISR

export default async function SentimentPage() {
  const [items, marketData] = await Promise.all([
    fetchAllFeeds(),
    fetchMarketData(),
  ]);

  const snapshot = computeSentimentSnapshot(items, marketData, null);
  const label = sentimentLabel(snapshot.globalScore);

  return (
    <div>
      {/* Page header — newspaper style */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          The Morality Index
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Multi-signal sentiment scoring across commodities, currencies, and
          world events — computed from {snapshot.feedItemsScanned} articles and
          weighted by source credibility
        </p>
      </div>

      {/* Scoring methodology */}
      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Composite Score</span> ={" "}
          Editorial Sentiment (35%) + Coverage Velocity (20%) + Contradiction
          Density (15%) + Market Movement (20%) + Bias Spread (10%)
        </p>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Thematic topics redistribute market weight across editorial signals.
          High contradiction density dampens scores toward neutral.
        </p>
      </div>

      {/* Global index hero */}
      <div className="mb-8">
        <GlobalIndexCard
          globalScore={snapshot.globalScore}
          globalTrend={snapshot.globalTrend}
          feedItemsScanned={snapshot.feedItemsScanned}
          topicCount={snapshot.topics.length}
          generatedAt={snapshot.generatedAt}
        />
      </div>

      {/* Topic grid */}
      <div className="mb-6 border-b border-[var(--rule)] pb-2">
        <h2 className="font-headline text-xl text-[var(--ink)]">
          Topic Breakdown
        </h2>
        <p className="mt-0.5 font-body-serif text-xs italic text-[var(--ink-light)]">
          Current reading: {label}. Click any topic for signal-level detail.
        </p>
      </div>

      <SentimentGrid topics={snapshot.topics} />
    </div>
  );
}
