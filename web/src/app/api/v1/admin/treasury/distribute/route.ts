// POST /api/v1/admin/treasury/distribute
//
// Body: { allocations: [{ agentId, amountUsd }], dryRun?: boolean }
// Auth: Bearer TREASURY_ADMIN_TOKEN
//
// Sends Base USDC from the operator EOA to each agent's SCW per the
// allocations list. Sequential transfers; one tx per agent.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/treasury/admin-auth";
import { executeDistribution, type Allocation } from "@/lib/treasury/distribute";
import { isAgentId } from "@/lib/wallets/agent-ids";

export const dynamic = "force-dynamic";

interface Body {
  allocations?: Array<{ agentId: string; amountUsd: number }>;
  dryRun?: boolean;
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
    return NextResponse.json({ error: "allocations[] required" }, { status: 400 });
  }

  const allocations: Allocation[] = [];
  for (const a of body.allocations) {
    if (!a || typeof a !== "object") {
      return NextResponse.json({ error: "each allocation must be an object" }, { status: 400 });
    }
    if (!isAgentId(a.agentId)) {
      return NextResponse.json({ error: `unknown agentId: ${a.agentId}` }, { status: 400 });
    }
    if (typeof a.amountUsd !== "number" || !Number.isFinite(a.amountUsd) || a.amountUsd <= 0) {
      return NextResponse.json({ error: `bad amountUsd for ${a.agentId}` }, { status: 400 });
    }
    allocations.push({
      agentId: a.agentId,
      amountRaw: BigInt(Math.floor(a.amountUsd * 1_000_000)),
    });
  }

  try {
    const result = await executeDistribution({
      allocations,
      dryRun: body.dryRun ?? true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
