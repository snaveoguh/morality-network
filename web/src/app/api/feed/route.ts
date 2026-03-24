import { NextResponse } from "next/server";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";

// Cache feed results for 5 minutes
let cachedItems: Awaited<ReturnType<typeof fetchAllFeeds>> | null = null;
let cacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 min (was 5 — cost savings)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");

  const now = Date.now();
  if (!cachedItems || now - cacheTime > CACHE_DURATION) {
    cachedItems = await fetchAllFeeds(DEFAULT_FEEDS);
    cacheTime = now;
  }

  let items = cachedItems;

  if (category && category !== "All") {
    items = items.filter((item) => item.category === category);
  }

  if (tag && tag.toLowerCase() !== "all") {
    const normalizedTag = tag.toLowerCase();
    items = items.filter((item) =>
      (item.tags || []).some((itemTag) => itemTag.toLowerCase() === normalizedTag)
    );
  }

  return NextResponse.json({ items, total: items.length });
}
