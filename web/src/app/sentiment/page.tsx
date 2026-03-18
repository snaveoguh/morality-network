import { fetchAllFeeds } from "@/lib/rss";
import {
  fetchMarketData,
  sentimentLabel,
  type SentimentSnapshot,
} from "@/lib/sentiment";
import { POOTER_SOUL_V1 } from "@/lib/agents/core";
import { computeEventShapedSentimentSnapshot } from "@/lib/event-corpus";
import { GlobalIndexCard } from "@/components/sentiment/GlobalIndexCard";
import { SentimentGrid } from "@/components/sentiment/SentimentGrid";
import { recordSnapshot } from "@/lib/score-history";

export const revalidate = 300; // 5 min ISR
export const maxDuration = 60; // allow up to 60s on Vercel Pro

let previousSnapshot: SentimentSnapshot | null = null;

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function loadSnapshot(): Promise<SentimentSnapshot | null> {
  try {
    const [items, marketData] = await Promise.all([
      withTimeout(fetchAllFeeds(), 25_000, []),
      withTimeout(fetchMarketData(), 8_000, { priceChanges: {} }),
    ]);

    if (items.length === 0) return null;

    const snapshot = await computeEventShapedSentimentSnapshot(items, marketData, previousSnapshot);
    previousSnapshot = snapshot;
    recordSnapshot(snapshot).catch(() => {});
    return snapshot;
  } catch (err) {
    console.error("[sentiment/page] Failed to load snapshot:", err);
    return null;
  }
}

function SentimentFallback() {
  return (
    <div>
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          The Morality Index
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          A provisional world-state index, not divine truth: it scores how the
          news graph is interpreting harm, agency, truth clarity, and power
          asymmetry across markets and events.
        </p>
      </div>

      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Morality, defined</span>{" "}
          = {POOTER_SOUL_V1.moralityDefinition.summary}
        </p>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          {POOTER_SOUL_V1.moralityDefinition.longform}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {POOTER_SOUL_V1.moralityDefinition.axes.map((axis) => (
            <div key={axis.key} className="border border-[var(--rule-light)] px-3 py-2">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
                {axis.label}
              </p>
              <p className="mt-1 font-body-serif text-xs text-[var(--ink-light)]">
                {axis.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[var(--rule-light)] p-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-red)]">
          Index Temporarily Unavailable
        </p>
        <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
          The feed sources timed out while building this page. The index recalculates
          every 5 minutes — refresh shortly and the data should be back.
        </p>
      </div>
    </div>
  );
}

export default async function SentimentPage() {
  const snapshot = await loadSnapshot();

  if (!snapshot) {
    return <SentimentFallback />;
  }

  const label = sentimentLabel(snapshot.globalScore);

  return (
    <div>
      {/* Page header — newspaper style */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          The Morality Index
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          A provisional world-state index, not divine truth: it scores how the
          news graph is interpreting harm, agency, truth clarity, and power
          asymmetry across markets and events.
        </p>
        <p className="mt-2 max-w-4xl font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          Current build: canonical event corpus + market tape, computed from{" "}
          {snapshot.eventCount ?? snapshot.feedItemsScanned} clustered events
          distilled out of {snapshot.feedItemsScanned} raw articles. It is
          signal-bearing, but it is not yet a full real-time civilizational
          firehose.
        </p>
      </div>

      {/* Definition */}
      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Morality, defined</span>{" "}
          = {POOTER_SOUL_V1.moralityDefinition.summary}
        </p>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          {POOTER_SOUL_V1.moralityDefinition.longform}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {POOTER_SOUL_V1.moralityDefinition.axes.map((axis) => (
            <div key={axis.key} className="border border-[var(--rule-light)] px-3 py-2">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ink)]">
                {axis.label}
              </p>
              <p className="mt-1 font-body-serif text-xs text-[var(--ink-light)]">
                {axis.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring methodology */}
      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Composite Score</span> ={" "}
          Editorial Sentiment (30%) + Human Impact Severity (15%) + Coverage Velocity (15%) + Contradiction
          Density (10%) + Market Movement (20%) + Bias Spread (10%)
        </p>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Sentiment and severity are scored by Claude AI (keyword fallback when unavailable).
          Thematic topics redistribute market weight across editorial signals.
          High severity events pull the index toward fear. High contradiction density dampens scores toward neutral.
        </p>
      </div>

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
    </div>
  );
}
