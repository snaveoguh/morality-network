import { NextRequest, NextResponse } from "next/server";
import { runMoralCompassPipeline } from "@/lib/agents/core/moral-compass";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/moral-compass/crawl
 * Called by Vercel cron daily at 3 AM UTC.
 * Crawls ethics/philosophy sources and builds the moral compass.
 *
 * Auth: Requires CRON_SECRET Bearer token (sent automatically by Vercel cron).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const result = await runMoralCompassPipeline();
    console.log("[moral-compass] pipeline complete:", result);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moral-compass] pipeline failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
