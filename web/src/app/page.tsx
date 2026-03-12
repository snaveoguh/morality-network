import { TileFeed } from "@/components/feed/TileFeed";
import { Masthead } from "@/components/layout/Masthead";
import { PooterTheme } from "@/components/PooterTheme";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { fetchFarcasterContent } from "@/lib/farcaster";
import { fetchDailyVideos } from "@/lib/video";
import { autoArchiveBatch } from "@/lib/archive";
import { generateBiasDigest } from "@/lib/bias-digest";
import { getSourceBias } from "@/lib/bias";
import { getDailyEdition } from "@/lib/daily-edition";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function FeedPage() {
  // All fetches race against a 25s timeout (Vercel hobby = 60s for serverless).
  // RSS alone takes ~7s on cold start. Any source that exceeds the timeout
  // returns empty gracefully rather than crashing the page.
  const [rssItems, proposals, casts, videos, dailyEdition] = await Promise.all([
    withTimeout(fetchAllFeeds(), 25000, []),
    withTimeout(fetchAllProposals(), 25000, []),
    withTimeout(fetchFarcasterContent("pip"), 25000, []),
    withTimeout(fetchDailyVideos(12), 25000, []),
    withTimeout(getDailyEdition().catch(() => null), 25000, null),
  ]);

  // Auto-archive all live feed items in one batch write.
  // Fire-and-forget — items persist so article pages don't show "Snapshot Pending".
  autoArchiveBatch(rssItems).catch(() => {});

  // Generate AI bias digest for the feed's source distribution
  const uniqueSources = new Map<string, ReturnType<typeof getSourceBias>>();
  for (const item of rssItems) {
    if (item.bias && !uniqueSources.has(item.bias.domain)) {
      uniqueSources.set(item.bias.domain, item.bias);
    }
  }
  const sourceList = [...uniqueSources.values()].filter(Boolean);
  const headlines = rssItems.slice(0, 20).map((i) => i.title);
  const biasDigest = await withTimeout(
    generateBiasDigest(sourceList as import("@/lib/bias").SourceBias[], headlines).catch(() => null),
    3000,
    null,
  );

  return (
    <>
      <PooterTheme />
      <Masthead
        dailyTitle={dailyEdition?.dailyTitle}
        dailyHeadline={dailyEdition?.headline}
        dailySubheadline={dailyEdition?.subheadline}
        dailyHash={dailyEdition?.hash}
      />
      <div className="mt-4">
        <TileFeed
          rssItems={rssItems}
          casts={casts}
          proposals={proposals}
          videos={videos}
          biasDigest={biasDigest}
        />
      </div>
    </>
  );
}
