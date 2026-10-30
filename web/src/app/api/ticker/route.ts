import { NextResponse } from "next/server";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { rankStoriesCached } from "@/lib/impact";

// Header ticker: the day's top stories by impact score (lib/impact.ts),
// with crypto and market stories kept off it (lib/front-filter.ts).
// The feed is cached in rss.ts and the ranking per feed refresh, so this
// costs one cached read per request.
export async function GET() {
  try {
    const items = await fetchAllFeeds(DEFAULT_FEEDS);
    const stories = rankStoriesCached(items, 8);
    return NextResponse.json(
      { stories },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ stories: [] }, { status: 200 });
  }
}
