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

export default async function FeedPage() {
  const [rssItems, proposals, casts, videos, dailyEdition] = await Promise.all([
    fetchAllFeeds(),
    fetchAllProposals(),
    fetchFarcasterContent("pip"),
    fetchDailyVideos(12),
    getDailyEdition().catch(() => null),
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
  const biasDigest = await generateBiasDigest(sourceList as import("@/lib/bias").SourceBias[], headlines).catch(() => null);

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
