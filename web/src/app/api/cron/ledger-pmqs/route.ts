// Cron: ingest the latest PMQs into the Claim Ledger.
// Schedule for Wednesday afternoons (PMQs ends ~12:30 UK; Hansard text lands
// within a few hours). Safe to re-run — inserts are idempotent.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { ingestLatestPmqs } from "@/lib/ledger/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await ingestLatestPmqs();
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }

  const { snapshot, persisted } = result;
  return NextResponse.json({
    ok: true,
    debate: snapshot.debate,
    claims: snapshot.claims.length,
    contributionsScanned: snapshot.contributionsScanned,
    contributionsWithClaims: snapshot.contributionsWithClaims,
    persisted,
  });
}
