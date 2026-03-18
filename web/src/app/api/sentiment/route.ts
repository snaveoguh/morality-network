import { NextRequest, NextResponse } from "next/server";
import { fetchAllFeeds } from "@/lib/rss";
import {
  type SentimentSnapshot,
} from "@/lib/sentiment";
import { computeEventShapedSentimentSnapshot } from "@/lib/event-corpus";
import { fetchMarketData } from "@/lib/sentiment";
import { recordSnapshot } from "@/lib/score-history";

export const revalidate = 300; // 5 minutes ISR
export const maxDuration = 60; // allow up to 60s on Vercel Pro

// In-memory cache
let cachedSnapshot: SentimentSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function GET(req: NextRequest) {
  const topicFilter = req.nextUrl.searchParams.get("topic");
  const now = Date.now();

  // Return cached if fresh
  if (cachedSnapshot && now - cacheTimestamp < CACHE_DURATION_MS) {
    return respond(cachedSnapshot, topicFilter);
  }

  try {
    // Fetch feeds + market data in parallel with timeouts
    const [allItems, marketData] = await Promise.all([
      withTimeout(fetchAllFeeds(), 25_000, []),
      withTimeout(fetchMarketData(), 8_000, { priceChanges: {} }),
    ]);

    if (allItems.length === 0 && cachedSnapshot) {
      return respond(cachedSnapshot, topicFilter);
    }

    const previousSnapshot = cachedSnapshot;
    const snapshot = await computeEventShapedSentimentSnapshot(
      allItems,
      marketData,
      previousSnapshot
    );

    // Cache the result
    cachedSnapshot = snapshot;
    cacheTimestamp = now;
    recordSnapshot(snapshot).catch(() => {});

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
