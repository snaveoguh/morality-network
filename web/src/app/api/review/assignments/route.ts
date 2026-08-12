import { NextRequest, NextResponse } from "next/server";

import { getMyAssignments } from "@/lib/ledger/review-staking";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/review/assignments — this reviewer's open work. Session cookie or
 * bearer token.
 *
 * Returns nothing about any other reviewer's vote. The round is blind until it
 * settles; leaking a peer's vote here would collapse three independent
 * judgments into one.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const assignments = await getMyAssignments(auth.accountId);
  return NextResponse.json({ assignments });
}
