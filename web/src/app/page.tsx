import { FeedList } from "@/components/feed/FeedList";
import { fetchAllFeeds } from "@/lib/rss";

export const revalidate = 300; // revalidate every 5 minutes

export default async function FeedPage() {
  const items = await fetchAllFeeds();

  return (
    <div>
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-wide text-white">
          The Permissionless Feed
        </h1>
        <p className="mt-2 text-zinc-400">
          Free news. Onchain discussion. Direct tips to creators.{" "}
          <span className="text-[#31F387]">No gatekeepers.</span>
        </p>
      </div>

      <FeedList items={items} />
    </div>
  );
}
