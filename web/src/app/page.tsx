import { FeedList } from "@/components/feed/FeedList";
import { GovernanceSection } from "@/components/feed/GovernanceSection";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";

export const revalidate = 120; // revalidate every 2 minutes (governance is time-sensitive)

export default async function FeedPage() {
  const [items, proposals] = await Promise.all([
    fetchAllFeeds(),
    fetchAllProposals(),
  ]);

  return (
    <div>
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-wide text-white">
          The Permissionless Feed
        </h1>
        <p className="mt-2 text-zinc-400">
          Free news. DAO governance. Onchain discussion. Direct tips to
          creators.{" "}
          <span className="text-[#31F387]">No gatekeepers.</span>
        </p>
      </div>

      {/* DAO Governance — live votes first */}
      <GovernanceSection proposals={proposals} />

      {/* Divider */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          News Feed
        </span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      {/* RSS News Feed */}
      <FeedList items={items} />
    </div>
  );
}
