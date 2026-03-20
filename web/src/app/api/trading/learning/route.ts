import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { getTraderConfig } from "@/lib/trading/config";
import { PositionStore } from "@/lib/trading/position-store";
import { generateLearningReport } from "@/lib/trading/self-learning";

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const config = getTraderConfig();
    const store = new PositionStore(config.positionStorePath);
    await store.load();

    const report = generateLearningReport(store.getAll());

    return NextResponse.json(report, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate learning report" },
      { status: 500 },
    );
  }
}
