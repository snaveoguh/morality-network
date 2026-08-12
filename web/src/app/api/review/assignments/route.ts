import { NextResponse } from "next/server";

import { getMyAssignments } from "@/lib/ledger/review-staking";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/review/assignments — this reviewer's open work.
 *
 * Returns nothing about any other reviewer's vote. The round is blind until it
 * settles; leaking a peer's vote here would collapse three independent
 * judgments into one.
 */
export async function GET() {
  const session = await getSession();
  if (!session.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const assignments = await getMyAssignments(session.accountId);
  return NextResponse.json({ assignments });
}
