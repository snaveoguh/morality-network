// Cron: manifesto backfill — one manifesto per invocation from the registry.
// Self-exhausting and idempotent, like the Budget backfill. Manifesto claims
// attribute to the party and are mostly predictive with the parliament as
// horizon; they publish as UNRESOLVED and resolve against the enacted record.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { ingestNextManifesto } from "@/lib/ledger/service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const result = await ingestNextManifesto();
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json(result);
}
