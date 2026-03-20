import { NextRequest, NextResponse } from "next/server";
import { getDailyEdition, getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial } from "@/lib/editorial-archive";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/cron/daily-edition — generate today's daily edition
 *
 * Called by Vercel cron (every 2h). Checks cache first — only generates
 * if today's edition doesn't exist yet. Safe to call repeatedly.
 *
 * Auth: Requires CRON_SECRET Bearer token (sent automatically by Vercel cron).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const hash = getDailyEditionHash();

    // Check if already generated today (fast path)
    const existing = await getArchivedEditorial(hash).catch(() => null);
    if (existing?.isDailyEdition) {
      return NextResponse.json({
        status: "cached",
        hash,
        headline: existing.primary.title,
        generatedAt: existing.generatedAt,
      });
    }

    // Generate — getDailyEdition() handles singleflight + all 3 passes
    console.log("[cron/daily-edition] No cached edition found, generating...");
    const result = await getDailyEdition();

    if (!result) {
      return NextResponse.json(
        { status: "skipped", reason: "No AI provider configured or generation failed" },
        { status: 200 },
      );
    }

    return NextResponse.json({
      status: "generated",
      hash: result.hash,
      dailyTitle: result.dailyTitle,
      headline: result.headline,
      generatedAt: result.generatedAt,
    });
  } catch (err) {
    console.error("[cron/daily-edition] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
