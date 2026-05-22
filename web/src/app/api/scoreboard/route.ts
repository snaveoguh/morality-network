import { NextResponse } from "next/server";
import { getOperatorAuthState } from "@/lib/operator-auth";
import { getInferenceFundingStatus } from "@/lib/scoreboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/scoreboard — the North Star metric.
 *
 * Returns whether the platform funds its own LLM inference out of realized
 * trading revenue, over a trailing window (?hours=N, default 168 = 7 days).
 *
 * Operator-gated for now — it exposes realized trading revenue.
 */
export async function GET(request: Request) {
  const authState = await getOperatorAuthState(request);
  if (!authState.authorized) {
    return NextResponse.json({ error: "Operator access required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hoursParam = Number.parseInt(searchParams.get("hours") ?? "", 10);
    const hours =
      Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : undefined;

    const status = await getInferenceFundingStatus({ hours });
    return NextResponse.json(status, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "scoreboard failed" },
      { status: 500 },
    );
  }
}
