import { NextResponse } from "next/server";
import { listTraderPositionsByRunner, redactedConfigSummary } from "@/lib/trading/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const openOnly = searchParams.get("openOnly") === "1";
    const positionsByRunner = await listTraderPositionsByRunner();
    const primaryPositions = openOnly
      ? positionsByRunner.primary.filter((position) => position.status === "open")
      : positionsByRunner.primary;
    const parallel = positionsByRunner.parallel.map((runner) => ({
      runnerId: runner.runnerId,
      label: runner.label,
      positions: openOnly
        ? runner.positions.filter((position) => position.status === "open")
        : runner.positions,
    }));

    return NextResponse.json(
      {
        positions: primaryPositions,
        parallel,
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
