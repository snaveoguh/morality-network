import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchAllFeeds } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { detectStoryCountries } from "@/lib/countries";
import { topTags } from "@/lib/front";
import { withBrand } from "@/lib/brand";
import { SearchView, type SearchItem } from "@/components/search/SearchView";

// ============================================================================
// SEARCH — the direction C home for everything the front page dropped:
// a prominent search box, trending hashtags, suggestions, and the Section /
// Region / Bias / Source filters as collapsed rows. Today's feed is filtered
// in the browser; queries also hit /api/search for the archive, originals,
// video, music and governance.
// ============================================================================

export const revalidate = 900;
export const maxDuration = 30;

export const metadata: Metadata = {
  title: withBrand("Search"),
  description: "Search today's feed and the pooter world archive, by topic, region, source and rated bias.",
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function SearchPage() {
  const feed = await withTimeout(fetchAllFeeds(), 8000, []);

  // Newest 400 is plenty to filter in the browser and keeps the payload small.
  const items: SearchItem[] = feed.slice(0, 400).map((item) => ({
    id: item.id,
    hash: computeEntityHash(item.link),
    title: item.title,
    description: (item.description || "").slice(0, 200),
    source: item.source,
    bias: item.bias?.bias ?? null,
    pubDate: item.pubDate,
    category: item.category,
    tags: (item.tags ?? []).map((t) => t.toLowerCase()),
    countries: detectStoryCountries(item.title, item.description ?? ""),
  }));

  return (
    <Suspense fallback={null}>
      <SearchView items={items} trending={topTags(feed, 12, 5)} />
    </Suspense>
  );
}
