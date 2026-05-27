// POST /api/v1/admin/treasury/bridge
//
// Body: { amountUsd: number, recipient?: 0x..., dryRun?: boolean }
// Auth: Bearer TREASURY_ADMIN_TOKEN
//
// Bridges USDC from the operator EOA on Arbitrum → recipient on Base via
// Across V3. Approves SpokePool if needed, then submits depositV3.
// Funds arrive in ~10–60s; check the recipient's Base USDC balance.

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireAdmin } from "@/lib/treasury/admin-auth";
import { executeArbToBaseBridge } from "@/lib/treasury/across";

export const dynamic = "force-dynamic";

interface Body {
  amountUsd?: number;
  recipient?: string;
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

  if (typeof body.amountUsd !== "number" || !Number.isFinite(body.amountUsd) || body.amountUsd <= 0) {
    return NextResponse.json({ error: "amountUsd (positive number) required" }, { status: 400 });
  }
  if (body.recipient !== undefined && !isAddress(body.recipient)) {
    return NextResponse.json({ error: "invalid recipient" }, { status: 400 });
  }

  try {
    const amountUsdcRaw = BigInt(Math.floor(body.amountUsd * 1_000_000));
    const result = await executeArbToBaseBridge({
      amountUsdcRaw,
      recipient: body.recipient as `0x${string}` | undefined,
      dryRun: body.dryRun ?? true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
