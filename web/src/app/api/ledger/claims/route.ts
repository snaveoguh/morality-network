// Public read API: this week's unresolved checkable claims.
// Every claim carries its verbatim quote + Hansard deep link. No verdicts
// exist in Phase A by design (spec §MVP plan).

import { NextResponse } from "next/server";
import { getLedgerWeekSnapshot } from "@/lib/ledger/service";

export const revalidate = 1800;

export async function GET() {
  const snapshot = await getLedgerWeekSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { error: "no PMQs sitting found in the current window" },
      { status: 404 },
    );
  }
  return NextResponse.json(snapshot);
}
