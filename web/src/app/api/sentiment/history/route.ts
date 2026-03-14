import { NextResponse } from "next/server";
import {
  loadHistory,
  getBoundaryScores,
  type TrendRange,
  type ScoreHistoryEntry,
} from "@/lib/score-history";

export const revalidate = 300; // 5 minutes, matching sentiment

export async function GET() {
  try {
    const history = await loadHistory();
    const raw = getBoundaryScores(history.entries);

    // Return compact boundary entries (only g + s, no full entry)
    const boundaries: Record<
      TrendRange,
      { g: number; s: Record<string, number> } | null
    > = {
      "1D": compact(raw["1D"]),
      "3D": compact(raw["3D"]),
      "1W": compact(raw["1W"]),
      "1M": compact(raw["1M"]),
    };

    return NextResponse.json(
      { boundaries },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { boundaries: { "1D": null, "3D": null, "1W": null, "1M": null } },
      { status: 200 },
    );
  }
}

function compact(
  entry: ScoreHistoryEntry | null,
): { g: number; s: Record<string, number> } | null {
  if (!entry) return null;
  return { g: entry.g, s: entry.s };
}
