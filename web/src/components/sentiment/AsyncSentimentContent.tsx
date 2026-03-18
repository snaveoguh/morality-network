import { fetchAllFeeds } from "@/lib/rss";
import {
  fetchMarketData,
  sentimentLabel,
  type SentimentSnapshot,
} from "@/lib/sentiment";
import { computeEventShapedSentimentSnapshot } from "@/lib/event-corpus";
import { GlobalIndexCard } from "@/components/sentiment/GlobalIndexCard";
import { SentimentGrid } from "@/components/sentiment/SentimentGrid";
import { recordSnapshot } from "@/lib/score-history";

let previousSnapshot: SentimentSnapshot | null = null;

export async function AsyncSentimentContent() {
  const [items, marketData] = await Promise.all([
    fetchAllFeeds(),
    fetchMarketData(),
  ]);

  const snapshot = await computeEventShapedSentimentSnapshot(items, marketData, previousSnapshot);
  previousSnapshot = snapshot;
  recordSnapshot(snapshot).catch(() => {});
  const label = sentimentLabel(snapshot.globalScore);

  return (
    <>
      {/* Counts in header context */}
      <p className="-mt-4 mb-4 max-w-4xl font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
        Current build: canonical event corpus + market tape, computed from{" "}
        {snapshot.eventCount ?? snapshot.feedItemsScanned} clustered events
        distilled out of {snapshot.feedItemsScanned} raw articles. It is
        signal-bearing, but it is not yet a full real-time civilizational
        firehose.
      </p>

      {/* Global index hero */}
      <div className="mb-8">
        <GlobalIndexCard
          globalScore={snapshot.globalScore}
          globalTrend={snapshot.globalTrend}
          feedItemsScanned={snapshot.feedItemsScanned}
          eventCount={snapshot.eventCount}
          topicCount={snapshot.topics.length}
          generatedAt={snapshot.generatedAt}
          sourceRegistrySize={snapshot.sourceRegistrySize}
          queuedCrawlTargets={snapshot.queuedCrawlTargets}
        />
      </div>

      {/* Topic grid */}
      <div className="mb-6 border-b border-[var(--rule)] pb-2">
        <h2 className="font-headline text-xl text-[var(--ink)]">
          Topic Breakdown
        </h2>
        <p className="mt-0.5 font-body-serif text-xs italic text-[var(--ink-light)]">
          Current reading: {label}. Every topic is expanded so the signal
          breakdown stays visible by default.
        </p>
      </div>

      <SentimentGrid topics={snapshot.topics} />
    </>
  );
}
