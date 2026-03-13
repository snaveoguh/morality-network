import { NextResponse } from "next/server";
import { getDailyEdition } from "@/lib/daily-edition";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/**
 * GET /api/daily-edition — trigger + return today's daily edition.
 * If cached, returns instantly. If not, generates via Claude (takes ~30-60s).
 */
export async function GET() {
  try {
    const edition = await getDailyEdition();
    if (!edition) {
      return NextResponse.json(
        { error: "No daily edition generated (missing API key or generation failed)" },
        { status: 503 },
      );
    }
    return NextResponse.json(edition);
  } catch (err) {
    console.error("[api/daily-edition] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
