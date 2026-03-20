import { NextResponse } from "next/server";
import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { findRelatedArticles } from "@/lib/article";
import { getAllEditorialHashes } from "@/lib/editorial-archive";
import { verifyOperatorAuth } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/editorial/discover
 *
 * Lightweight endpoint that returns feed items needing editorials,
 * pre-computed with related articles so generate-one can skip the
 * expensive fetchAllFeeds() call.
 *
 * Query params:
 *   ?limit=N  (default 5, max 10)
 */
export async function GET(request: Request) {
  const unauthorized = await verifyOperatorAuth(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10) || 5),
    10,
  );

  const allItems = await fetchAllFeeds();
  if (allItems.length === 0) {
    return NextResponse.json({ items: [], total: 0 });
  }

  const existingHashes = await getAllEditorialHashes().catch(
    () => new Set<string>(),
  );

  // Find items that don't have editorials yet
  const missing: Array<{
    hash: string;
    primary: FeedItem;
    related: FeedItem[];
  }> = [];

  for (const item of allItems) {
    if (missing.length >= limit) break;
    const hash = computeEntityHash(item.link);
    if (!existingHashes.has(hash)) {
      const related = findRelatedArticles(item, allItems, 5);
      missing.push({ hash, primary: item, related });
    }
  }

  return NextResponse.json({
    items: missing,
    total: missing.length,
    feedSize: allItems.length,
    existingCount: existingHashes.size,
  });
}
