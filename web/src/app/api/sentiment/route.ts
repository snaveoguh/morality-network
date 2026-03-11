import { NextRequest, NextResponse } from "next/server";
import { fetchAllFeeds } from "@/lib/rss";
import {
  computeSentimentSnapshot,
  fetchMarketData,
  type SentimentSnapshot,
} from "@/lib/sentiment";

export const revalidate = 300; // 5 minutes ISR

// In-memory cache
let cachedSnapshot: SentimentSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const topicFilter = req.nextUrl.searchParams.get("topic");
  const now = Date.now();

  // Return cached if fresh
  if (cachedSnapshot && now - cacheTimestamp < CACHE_DURATION_MS) {
    return respond(cachedSnapshot, topicFilter);
  }

  try {
    // Fetch feeds + market data in parallel
    const [allItems, marketData] = await Promise.all([
      fetchAllFeeds(),
      fetchMarketData(),
    ]);

    const previousSnapshot = cachedSnapshot;
    const snapshot = computeSentimentSnapshot(allItems, marketData, previousSnapshot);

    // Cache the result
    cachedSnapshot = snapshot;
    cacheTimestamp = now;

    return respond(snapshot, topicFilter);
  } catch (err) {
    console.error("[sentiment] computation failed:", err);

    // Return stale cache if available
    if (cachedSnapshot) {
      return respond(cachedSnapshot, topicFilter);
    }

    return NextResponse.json(
      { error: "Failed to compute sentiment snapshot" },
      { status: 500 },
    );
  }
}

function respond(snapshot: SentimentSnapshot, topicFilter: string | null): NextResponse {
  const data = topicFilter
    ? {
        ...snapshot,
        topics: snapshot.topics.filter((t) => t.slug === topicFilter),
      }
    : snapshot;

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
