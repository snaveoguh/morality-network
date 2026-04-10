import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    // Emergent agent swarm removed — return empty snapshot
    return NextResponse.json(
      { agents: [], totalAgents: 0, note: "Emergent agent swarm has been removed. Real agent signals flow through the research swarm pipeline." },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "swarm status failed" },
      { status: 500 },
    );
  }
}
