import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { getSwarmSnapshot } from "@/lib/agents/spawn-swarm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const snapshot = getSwarmSnapshot();

    return NextResponse.json(snapshot, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "swarm status failed" },
      { status: 500 },
    );
  }
}
