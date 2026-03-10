import { NextResponse } from "next/server";
import { getTraderPerformance, redactedConfigSummary } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const performance = await getTraderPerformance();
    return NextResponse.json(
      {
        performance,
        config: redactedConfigSummary(),
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
        error: error instanceof Error ? error.message : "metrics failed",
      },
      { status: 500 }
    );
  }
}
