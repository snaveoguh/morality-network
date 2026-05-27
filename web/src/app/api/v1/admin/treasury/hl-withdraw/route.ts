// POST /api/v1/admin/treasury/hl-withdraw
//
// Body: { amountUsd: number, destination?: 0x..., dryRun?: boolean }
// Auth: Bearer TREASURY_ADMIN_TOKEN

import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireAdmin } from "@/lib/treasury/admin-auth";
import { executeHlWithdraw } from "@/lib/treasury/hl";

export const dynamic = "force-dynamic";

interface Body {
  amountUsd?: number;
  destination?: string;
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

  if (typeof body.amountUsd !== "number" || !Number.isFinite(body.amountUsd)) {
    return NextResponse.json({ error: "amountUsd (number) required" }, { status: 400 });
  }
  if (body.destination !== undefined && !isAddress(body.destination)) {
    return NextResponse.json({ error: "invalid destination" }, { status: 400 });
  }

  try {
    const result = await executeHlWithdraw({
      amountUsd: body.amountUsd,
      destination: body.destination as `0x${string}` | undefined,
      dryRun: body.dryRun ?? true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
