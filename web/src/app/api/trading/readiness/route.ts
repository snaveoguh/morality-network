import { NextResponse } from "next/server";
import { getTraderReadinessByRunner, redactedConfigSummary } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const readinessByRunner = await getTraderReadinessByRunner();
    return NextResponse.json(
      {
        readiness: readinessByRunner.primary,
        parallel: readinessByRunner.parallel,
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
