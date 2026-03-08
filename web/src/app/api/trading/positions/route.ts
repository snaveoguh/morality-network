import { NextResponse } from "next/server";
import { listTraderPositions, redactedConfigSummary } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const openOnly = searchParams.get("openOnly") === "1";
    const positions = await listTraderPositions();

    return NextResponse.json(
      {
        positions: openOnly ? positions.filter((position) => position.status === "open") : positions,
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
        error: error instanceof Error ? error.message : "positions failed",
      },
      { status: 500 }
    );
  }
}
