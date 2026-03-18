// ============================================================================
// ASYNC FEED — server component that fetches all feed data, then renders
//
// Wrapped in <Suspense fallback={<FeedSkeleton />}> by the page.
// Streams into the page as soon as all feed sources resolve (or timeout).
// ============================================================================

import { after } from "next/server";
import { TileFeed } from "./TileFeed";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals, fetchGovernanceSocialSignals } from "@/lib/governance";
import { fetchFarcasterContent } from "@/lib/farcaster";
import { fetchDailyVideos } from "@/lib/video";
import { autoArchiveBatch, getArchivedFeedItemByHash } from "@/lib/archive";
import { computeEntityHash } from "@/lib/entity";
import { generateBiasDigest } from "@/lib/bias-digest";
import { getSourceBias } from "@/lib/bias";
import { getTodayPublishedHashes } from "@/lib/newsroom-edition";
import { GovernanceSocialList } from "@/components/proposals/GovernanceSocialList";

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncFeed() {
  const [rssItems, proposals, governanceSignals, casts, videos, publishedHashes] = await Promise.all([
    withTimeout(fetchAllFeeds(), 8000, []),
    withTimeout(fetchAllProposals(), 8000, []),
    withTimeout(fetchGovernanceSocialSignals(), 5000, []),
    withTimeout(fetchFarcasterContent("pip"), 5000, []),
    withTimeout(fetchDailyVideos(12), 5000, []),
    withTimeout(getTodayPublishedHashes(), 3000, new Set<string>()),
  ]);

  // Inject published stories that rotated out of the live RSS feed
  if (publishedHashes.size > 0) {
    const liveHashes = new Set<string>(rssItems.map((i) => computeEntityHash(i.link)));
    const missing = [...publishedHashes].filter((h) => !liveHashes.has(h));
    if (missing.length > 0) {
      const recovered = await Promise.all(
        missing.map((h) =>
          getArchivedFeedItemByHash(h as `0x${string}`).catch(() => null),
        ),
      );
      for (const item of recovered) {
        if (item) rssItems.push(item);
      }
    }
  }

  // Archive all feed items after response is sent (ISR-safe)
  after(() => {
    autoArchiveBatch(rssItems).catch((err) => {
      console.warn("[AsyncFeed] archive batch failed:", err);
    });
  });

  // Compute bias digest synchronously from already-fetched data (no AI call)
  const uniqueSources = new Map<string, ReturnType<typeof getSourceBias>>();
  for (const item of rssItems) {
    if (item.bias && !uniqueSources.has(item.bias.domain)) {
      uniqueSources.set(item.bias.domain, item.bias);
    }
  }
  const sourceList = [...uniqueSources.values()].filter(Boolean);
  const headlines = rssItems.slice(0, 20).map((i) => i.title);
  // Use short timeout — the computed (non-AI) fallback inside generateBiasDigest
  // is instant, the AI call is what's slow. Cap at 1s so we don't block rendering.
  const biasDigest = await withTimeout(
    generateBiasDigest(sourceList as import("@/lib/bias").SourceBias[], headlines).catch(
      () => null,
    ),
    1000,
    null,
  );

  return (
    <>
      <GovernanceSocialList signals={governanceSignals} />
      <TileFeed
        rssItems={rssItems}
        casts={casts}
        proposals={proposals}
        videos={videos}
        biasDigest={biasDigest}
        publishedHashList={[...publishedHashes]}
      />
    </>
  );
}
