import { TileFeed } from "@/components/feed/TileFeed";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { fetchFarcasterContent } from "@/lib/farcaster";

export const revalidate = 120;

export default async function FeedPage() {
  const [rssItems, proposals, casts] = await Promise.all([
    fetchAllFeeds(),
    fetchAllProposals(),
    fetchFarcasterContent("pip"),
  ]);

  return <TileFeed rssItems={rssItems} casts={casts} proposals={proposals} />;
}
