import { NextResponse } from "next/server";
import { getAggregatedMarketSignals } from "@/lib/trading/signals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") || "");
    const minScoreParam = Number(searchParams.get("minScore") || "");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 250;
    const minAbsScore = Number.isFinite(minScoreParam) && minScoreParam > 0 ? minScoreParam : 0.2;

    const signals = await getAggregatedMarketSignals({ limit, minAbsScore });
    return NextResponse.json(
      {
        signals,
        count: signals.length,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "signal aggregation failed",
      },
      { status: 500 }
    );
  }
}
