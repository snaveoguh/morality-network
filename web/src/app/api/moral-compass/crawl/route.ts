import { NextResponse } from "next/server";
import { runMoralCompassPipeline } from "@/lib/agents/core/moral-compass";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/moral-compass/crawl
 * Called by Vercel cron daily at 3 AM UTC.
 * Crawls ethics/philosophy sources and builds the moral compass.
 */
export async function GET() {
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
