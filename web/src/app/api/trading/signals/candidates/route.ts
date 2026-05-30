import { NextResponse } from "next/server";
import { getExecutionCandidateSnapshot } from "@/lib/trading/execution-candidates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") || "");
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 8;

    const snapshot = await getExecutionCandidateSnapshot();
    const candidates = snapshot.markets.filter((market) => market.hasSignal).slice(0, limit);

    return NextResponse.json(
      {
        timestamp: snapshot.timestamp,
        minConfidence: snapshot.minConfidence,
        candidates,
        count: candidates.length,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "execution candidate aggregation failed",
      },
      { status: 500 },
    );
  }
}
