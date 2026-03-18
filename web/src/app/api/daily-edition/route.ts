import { NextResponse } from "next/server";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getArchivedEditorial } from "@/lib/editorial-archive";

export const dynamic = "force-dynamic";

/**
 * GET /api/daily-edition — return today's cached daily edition.
 * CACHE-ONLY: never generates. Daily editions are created by the newsroom cron.
 */
export async function GET() {
  try {
    const hash = getDailyEditionHash();
    const cached = await getArchivedEditorial(hash);

    if (!cached?.isDailyEdition) {
      return NextResponse.json(
        { error: "No daily edition cached for today. Newsroom cron runs every 2h." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      hash,
      dailyTitle: cached.dailyTitle ?? "DAILY EDITION",
      headline: cached.primary.title,
      subheadline: cached.subheadline,
      generatedAt: cached.generatedAt,
    });
  } catch (err) {
    console.error("[api/daily-edition] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
