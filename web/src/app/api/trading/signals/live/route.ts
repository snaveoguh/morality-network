import { NextResponse } from "next/server";
import { requireMoHolderAccess } from "@/lib/holder-access";
import { getExecutionCandidateSnapshot } from "@/lib/trading/execution-candidates";

export async function GET(request: Request) {
  try {
    const access = await requireMoHolderAccess(request);
    if (access instanceof NextResponse) {
      return access;
    }

    const snapshot = await getExecutionCandidateSnapshot();

    return NextResponse.json(
      {
        timestamp: snapshot.timestamp,
        minConfidence: snapshot.minConfidence,
        markets: snapshot.markets,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute live signals" },
      { status: 500 },
    );
  }
}
