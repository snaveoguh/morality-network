// ============================================================================
// ASYNC FEED — server component that fetches the news feed, then renders the
// direction C front page body (trending, secondaries, chart, latest).
//
// Wrapped in <Suspense fallback={<FeedSkeleton />}> by the page.
// Streams into the page as soon as the feed sources resolve (or time out).
// The busier tile feed (casts, proposals, videos, filters) is retired from
// the front page; filters live in /search and the rest in /more.
// ============================================================================

import { after } from "next/server";
import { FrontFeed } from "./FrontFeed";
import { fetchAllFeeds } from "@/lib/rss";
import { autoArchiveBatch, getArchivedFeedItemByHash } from "@/lib/archive";
import { computeEntityHash } from "@/lib/entity";
import { getTodayPublishedHashes } from "@/lib/newsroom-edition";

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncFeed() {
  const [rssItems, publishedHashes] = await Promise.all([
    withTimeout(fetchAllFeeds(), 8000, []),
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

  return <FrontFeed rssItems={rssItems} publishedHashes={publishedHashes} />;
}
