import { NextRequest, NextResponse } from "next/server";
import { buildPredictionMarketOpsSnapshot } from "@/lib/prediction-market-ops";
import { verifyOperatorAuth } from "@/lib/operator-auth";

export const revalidate = 60;
export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const snapshot = await buildPredictionMarketOpsSnapshot({ limit });
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[predictions/ops] Failed to build ops snapshot:", error);
    return NextResponse.json(
      { error: "Failed to build prediction market ops snapshot." },
      { status: 500 },
    );
  }
}
