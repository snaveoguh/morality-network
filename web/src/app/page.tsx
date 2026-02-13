import { MixedFeed } from "@/components/feed/MixedFeed";
import { GovernanceSection } from "@/components/feed/GovernanceSection";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { fetchFarcasterContent } from "@/lib/farcaster";

export const revalidate = 120; // 2 min — governance is time-sensitive

export default async function FeedPage() {
  const [rssItems, proposals, casts] = await Promise.all([
    fetchAllFeeds(),
    fetchAllProposals(),
    fetchFarcasterContent("pip"),
  ]);

  return (
    <div>
      {/* Hero — newspaper style */}
      <div className="mb-8 border-b-4 border-double border-white/10 pb-4">
        <h1 className="font-headline text-4xl text-white sm:text-5xl">
          The Permissionless Feed
        </h1>
        <p className="font-comic mt-2 text-zinc-400">
          Free news. DAO governance. Farcaster casts. Onchain discussion.
          Direct tips to creators.{" "}
          <span className="text-[#31F387]">No gatekeepers.</span>
        </p>
      </div>

      {/* DAO Governance — live votes first */}
      <GovernanceSection proposals={proposals} />

      {/* Divider */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="font-comic text-xs font-medium uppercase tracking-wider text-zinc-500">
          The Chaotic Feed
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {/* Mixed feed — RSS + Farcaster casts interleaved */}
      <MixedFeed rssItems={rssItems} casts={casts} />
    </div>
  );
}
