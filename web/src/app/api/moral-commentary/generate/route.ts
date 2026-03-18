import { NextResponse } from "next/server";
import { generateMoralCommentary } from "@/lib/moral-commentary";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/moral-commentary/generate
 * Called by Vercel cron daily at 4 AM UTC (1 hour after moral compass crawl).
 * Generates today's Moral Commentary article.
 */
export async function GET() {
  try {
    const result = await generateMoralCommentary();
    console.log("[moral-commentary] route result:", result);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moral-commentary] route error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
