import { NextResponse } from "next/server";
import { getTraderReadiness, redactedConfigSummary } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const readiness = await getTraderReadiness();
    return NextResponse.json(
      {
        readiness,
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
        error: error instanceof Error ? error.message : "readiness failed",
      },
      { status: 500 }
    );
  }
}
