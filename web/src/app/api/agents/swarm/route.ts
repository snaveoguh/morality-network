import { NextResponse } from "next/server";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { runResearchSwarm } from "@/lib/agent-swarm";

let cached: ReturnType<typeof runResearchSwarm> | null = null;
let cacheTime = 0;
const CACHE_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clusterLimit = Number(searchParams.get("clusters") || "20");
  const now = Date.now();

  if (!cached || now - cacheTime > CACHE_MS) {
    const items = await fetchAllFeeds(DEFAULT_FEEDS);
    cached = runResearchSwarm(items, 30);
    cacheTime = now;
  }

  const safeLimit = Number.isFinite(clusterLimit)
    ? Math.min(Math.max(clusterLimit, 1), 40)
    : 20;

  return NextResponse.json({
    generatedAt: cached.generatedAt,
    scannedItems: cached.scannedItems,
    clusters: cached.clusters.slice(0, safeLimit),
    contradictionFlags: cached.contradictionFlags,
  });
}
