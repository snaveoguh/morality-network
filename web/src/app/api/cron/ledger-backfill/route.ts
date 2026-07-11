// Cron: Tier 2 backfill — one Budget speech per invocation, oldest first.
// Self-exhausting (returns done=true when the 2010→now corpus is ingested)
// and idempotent (sittings with claims already stored are skipped), so a
// daily schedule quietly builds the archive and then no-ops.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { ingestNextBudget } from "@/lib/ledger/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await ingestNextBudget();
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json(result);
}
