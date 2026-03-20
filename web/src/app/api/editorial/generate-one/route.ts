import { NextResponse } from "next/server";
import type { FeedItem } from "@/lib/rss";
import { generateEditorial } from "@/lib/article";
import {
  getArchivedEditorial,
  saveEditorial,
} from "@/lib/editorial-archive";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a deadline so we return before Vercel kills us. */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded ${ms}ms deadline`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * POST /api/editorial/generate-one
 *
 * Generates a single editorial from pre-computed feed data.
 * No feed fetching — primary + related items are passed in the body.
 * Designed to fit within Vercel's function timeout.
 *
 * Body: { hash: string, primary: FeedItem, related: FeedItem[] }
 */
export async function POST(request: Request) {
  // Rate limit: 5 editorial generations per minute per IP
  const limited = rateLimit(request, { maxRequests: 5, windowMs: 60_000 });
  if (limited) return limited;
  let hash: string;
  let primary: FeedItem;
  let related: FeedItem[];

  try {
    const body = await request.json();
    hash = body.hash;
    primary = body.primary;
    related = body.related || [];

    if (!hash || !primary?.link || !primary?.title) {
      return NextResponse.json(
        { error: "Missing required fields: hash, primary.link, primary.title" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Skip if already generated (race condition guard)
  try {
    const existing = await getArchivedEditorial(hash);
    if (existing) {
      return NextResponse.json({
        status: "skipped",
        hash,
        title: primary.title,
        reason: "already exists",
      });
    }
  } catch {
    // Continue to generation
  }

  try {
    // 50s deadline — gives us ~5s buffer before Vercel's 55s hard kill
    const article = await withDeadline(
      generateEditorial(primary, related, { skipCache: true }),
      50_000,
      "generate-one",
    );

    const generatedBy = (article as { generatedBy?: string }).generatedBy;
    await saveEditorial(
      hash,
      article,
      generatedBy === "claude-ai" ? "claude-ai" : "template-fallback",
    );

    console.log(
      `[generate-one] ${generatedBy || "unknown"} editorial for "${primary.title.slice(0, 50)}..."`,
    );

    return NextResponse.json({
      status: "generated",
      hash,
      title: primary.title,
      generatedBy: generatedBy || "unknown",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-one] failed for ${hash.slice(0, 10)}...: ${message}`);
    return NextResponse.json(
      {
        status: "error",
        hash,
        title: primary.title,
        error: message,
      },
      { status: 500 },
    );
  }
}
