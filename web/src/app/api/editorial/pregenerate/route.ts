import { NextResponse } from "next/server";
import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { computeEntityHash } from "@/lib/entity";
import { findRelatedArticles, generateEditorial } from "@/lib/article";
import {
  getArchivedEditorial,
  saveEditorial,
  getAllEditorialHashes,
} from "@/lib/editorial-archive";

export const dynamic = "force-dynamic";
export const maxDuration = 55; // Vercel limit

/**
 * GET /api/editorial/pregenerate
 *
 * Called by GitHub Actions cron (every 30 min) and Vercel cron (daily).
 * Pre-generates top 5 feed items that don't have editorials yet.
 */
export async function GET() {
  return runPregenerate([], 5);
}

/**
 * POST /api/editorial/pregenerate
 *
 * Pre-generates AI editorials for feed items that don't have one yet.
 * Accepts an optional list of hashes to prioritize, otherwise picks the
 * top N items from the current feed.
 *
 * Body (optional):
 *   { hashes?: string[], limit?: number }
 *
 * This ensures editorials are ready in the archive BEFORE users click,
 * so every user sees the exact same AI-generated content.
 */
export async function POST(request: Request) {
  let requestedHashes: string[] = [];
  let limit = 5;

  try {
    const body = await request.json();
    if (Array.isArray(body.hashes)) {
      requestedHashes = body.hashes.filter(
        (h: unknown) => typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h as string),
      );
    }
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, 10); // cap at 10 per request
    }
  } catch {
    // Empty body is fine — we'll use defaults
  }

  return runPregenerate(requestedHashes, limit);
}

async function runPregenerate(requestedHashes: string[], limit: number) {
  const allItems = await fetchAllFeeds();
  if (allItems.length === 0) {
    return NextResponse.json({ generated: 0, skipped: 0, errors: 0 });
  }

  // Build hash → FeedItem lookup
  const itemsByHash = new Map<string, FeedItem>();
  for (const item of allItems) {
    itemsByHash.set(computeEntityHash(item.link), item);
  }

  // Determine which hashes to generate for
  let targetHashes: string[];
  if (requestedHashes.length > 0) {
    targetHashes = requestedHashes;
  } else {
    const existingHashes = await getAllEditorialHashes().catch(() => new Set<string>());
    targetHashes = allItems
      .map((item) => computeEntityHash(item.link))
      .filter((hash) => !existingHashes.has(hash))
      .slice(0, limit);
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;
  const results: Array<{ hash: string; status: "generated" | "skipped" | "error"; title?: string }> = [];

  for (const hash of targetHashes) {
    try {
      const existing = await getArchivedEditorial(hash);
      if (existing) {
        skipped++;
        results.push({ hash, status: "skipped" });
        continue;
      }
    } catch {
      // Continue to generation
    }

    const primary = itemsByHash.get(hash);
    if (!primary) {
      skipped++;
      results.push({ hash, status: "skipped" });
      continue;
    }

    try {
      const related = findRelatedArticles(primary, allItems, 5);
      const article = await generateEditorial(primary, related);

      const generatedBy = (article as { generatedBy?: string }).generatedBy;
      await saveEditorial(
        hash,
        article,
        generatedBy === "claude-ai" ? "claude-ai" : "template-fallback",
      );

      generated++;
      results.push({ hash, status: "generated", title: primary.title });
      console.log(`[pregenerate] generated editorial for "${primary.title.slice(0, 50)}..."`);
    } catch (err) {
      errors++;
      results.push({ hash, status: "error" });
      console.error(`[pregenerate] failed for ${hash.slice(0, 10)}...:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ generated, skipped, errors, results });
}
