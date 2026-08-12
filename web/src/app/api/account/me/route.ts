import { NextResponse } from "next/server";

import { getAccountSummary, getLedger } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/me — the signed-in account, its MO balance and history. */
export async function GET() {
  const session = await getSession();
  if (!session.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const account = await getAccountSummary(session.accountId);
  if (!account) {
    session.destroy();
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const ledger = await getLedger(session.accountId);
  return NextResponse.json({
    account,
    ledger: ledger.map((e) => ({
      id: e.id,
      delta: e.delta,
      reason: e.reason,
      ref: e.ref,
      createdAt: e.created_at.toISOString(),
    })),
  });
}
