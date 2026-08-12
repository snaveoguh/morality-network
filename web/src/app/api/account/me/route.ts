import { NextRequest, NextResponse } from "next/server";

import { getAccountSummary, getLedger } from "@/lib/accounts";
import { getAuthContext } from "@/lib/auth-context";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/me — the signed-in account, its MO balance and history.
 * Accepts the session cookie or a bearer token (Authorization: Bearer pat_...).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const account = await getAccountSummary(auth.accountId);
  if (!account) {
    if (auth.via === "session") {
      const session = await getSession();
      session.destroy();
    }
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const ledger = await getLedger(auth.accountId);
  return NextResponse.json({
    account,
    // Canonical numeric balance for clients that don't parse the NUMERIC
    // string (mobile wallet tab). account.balanceMo stays the exact value.
    points: Number.parseFloat(account.balanceMo) || 0,
    ledger: ledger.map((e) => ({
      id: e.id,
      delta: e.delta,
      reason: e.reason,
      ref: e.ref,
      createdAt: e.created_at.toISOString(),
    })),
  });
}
