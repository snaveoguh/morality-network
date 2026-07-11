// Cron: propose resolutions for unresolved voting-record + statistics claims.
// Proposals go to the human review queue at /ledger/review — this endpoint
// never publishes a verdict. Safe to re-run; claims with a live proposal
// are skipped.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { proposeResolutionsForUnresolved } from "@/lib/ledger/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await proposeResolutionsForUnresolved();
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json(result);
}
