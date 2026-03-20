import { NextRequest, NextResponse } from "next/server";
import { runNewsroom } from "@/lib/newsroom";
import { getNewsroomEdition } from "@/lib/newsroom-edition";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 55; // Vercel hobby plan limit

// ============================================================================
// GET /api/newsroom — run the newsroom pipeline (cron endpoint)
//
// Called by Vercel cron every 2h. Generates Pooter Originals for top stories.
// Idempotent — skips stories that already have editorials.
//
// Auth: Requires CRON_SECRET Bearer token (sent automatically by Vercel cron).
// ============================================================================

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    // Run the pipeline — capped at 2 stories per cron invocation to fit
    // within Vercel's 55s maxDuration. Runs every 2h, so ~24 originals/day.
    // Idempotent: skips already-generated stories.
    const result = await runNewsroom({
      forceRegenerate: false,
      maxStories: 2,
      minStories: 1,
    });

    return NextResponse.json({
      generated: result.generated,
      skipped: result.skipped,
      errors: result.errors,
      totalStories: result.edition.stories.length,
      details: result.details,
    });
  } catch (err) {
    console.error("[newsroom/cron] Pipeline failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ============================================================================
// POST /api/newsroom — triggers the newsroom pipeline (auth required)
//
// Body (optional): { forceRegenerate?: boolean, maxStories?: number }
// Auth: Authorization: Bearer <NEWSROOM_SECRET>
// ============================================================================

export async function POST(request: NextRequest) {
  // Auth check — use CRON_SECRET (consistent with all other cron endpoints)
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  let body: {
    forceRegenerate?: boolean;
    maxStories?: number;
    minStories?: number;
  } = {};

  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  try {
    const result = await runNewsroom({
      forceRegenerate: body.forceRegenerate ?? false,
      maxStories: Math.min(body.maxStories ?? 25, 25),
      minStories: Math.max(body.minStories ?? 5, 1),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[newsroom/api] Pipeline failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        generated: 0,
        skipped: 0,
        errors: 1,
      },
      { status: 500 },
    );
  }
}
