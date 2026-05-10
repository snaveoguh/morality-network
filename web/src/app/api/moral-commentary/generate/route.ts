import { NextRequest, NextResponse } from "next/server";
import { generateMoralCommentary } from "@/lib/moral-commentary";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/moral-commentary/generate
 * Called by the scheduled job daily at 4 AM UTC (1 hour after moral compass crawl).
 * Generates today's Moral Commentary article.
 *
 * Auth: Requires CRON_SECRET Bearer token from the active scheduler.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const result = await generateMoralCommentary();
    console.log("[moral-commentary] route result:", result);
    // Treat a non-generated, non-skipped result as a real failure so the
    // scheduled job fails loudly instead of green-checking every empty run.
    const isHardFailure = !result.generated && !result.skipped;
    return NextResponse.json(result, { status: isHardFailure ? 500 : 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moral-commentary] route error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
