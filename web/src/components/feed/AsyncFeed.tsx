// ============================================================================
// ASYNC FEED — server component that fetches the news feed, then renders the
// direction C front page body (trending, secondaries, chart, latest).
//
// Wrapped in <Suspense fallback={<FeedSkeleton />}> by the page.
// Streams into the page as soon as the feed sources resolve (or time out).
// The busier tile feed (casts, proposals, videos, filters) is retired from
// the front page; filters live in /search and the rest in /more.
//
// Crypto and market stories (lib/front-filter.ts) are ordered after the rest
// and never count as newsroom picks here, so they can't lead Latest or the
// Trending row. They stay in the data for the Business & markets tab.
// ============================================================================

import { after } from "next/server";
import { FrontFeed } from "./FrontFeed";
import { fetchAllFeeds } from "@/lib/rss";
import { autoArchiveBatch, getArchivedFeedItemByHash, getLocalArchivedFeedItems } from "@/lib/archive";
import { getRecentPooterOriginals, type PooterOriginal } from "@/lib/editorial-archive";
import type { FeedItem } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { getTodayPublishedHashes } from "@/lib/newsroom-edition";
import { frontFirst, isMarketStory } from "@/lib/front-filter";

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncFeed() {
  const [liveItems, publishedHashes, originals] = await Promise.all([
    withTimeout(fetchAllFeeds(), 12000, [] as FeedItem[]),
    withTimeout(getTodayPublishedHashes(), 3000, new Set<string>()),
    withTimeout(getRecentPooterOriginals(false), 3000, [] as PooterOriginal[]),
  ]);

  // A cold or slow crawl must never cache an empty front page for the whole
  // ISR window: fall back to the newest stories in the local archive.
  let rssItems = liveItems;
  if (rssItems.length === 0) {
    console.warn("[AsyncFeed] live feed empty; serving archived stories");
    const archived = await withTimeout(getLocalArchivedFeedItems(), 3000, [] as FeedItem[]);
    rssItems = archived
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 200);
  }

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
    autoArchiveBatch(liveItems).catch((err) => {
      console.warn("[AsyncFeed] archive batch failed:", err);
    });
  });

  // Same items, front-eligible first. Market stories lose newsroom-pick
  // priority, which would otherwise put them at the head of Latest.
  const marketHashes = new Set<string>(rssItems.filter(isMarketStory).map((i) => computeEntityHash(i.link)));
  const frontPicks = new Set([...publishedHashes].filter((h) => !marketHashes.has(h)));

  return <FrontFeed rssItems={frontFirst(rssItems)} publishedHashes={frontPicks} originals={originals} />;
}
