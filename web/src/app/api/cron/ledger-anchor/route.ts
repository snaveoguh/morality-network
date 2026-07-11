// Cron: daily Merkle batch. Computes the root over yesterday's recorded
// claims and stores it in ledger_merkle_batches. The onchain anchor to Base
// (one tx/day, LedgerAnchor.sol) activates once LEDGER_ANCHOR_ADDRESS +
// LEDGER_ANCHOR_PRIVATE_KEY are configured — until then roots accumulate
// offchain and are anchorable retroactively.

import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { computeClaimsRoot } from "@/lib/ledger/merkle";
import { sql } from "@/lib/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, reason: "anchoring requires DATABASE_URL" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  // Default: yesterday UTC (the day is complete). ?day=YYYY-MM-DD overrides
  // for retroactive batching.
  const day =
    url.searchParams.get("day") ??
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ ok: false, reason: "bad day param" }, { status: 400 });
  }

  const { listLedgerClaimsCreatedOn } = await import("@/lib/db/ledger-claims");
  const claims = await listLedgerClaimsCreatedOn(day);
  const { root, count } = computeClaimsRoot(claims);
  if (!root) {
    return NextResponse.json({ ok: true, day, claims: 0, root: null, note: "no claims that day" });
  }

  await sql`
    INSERT INTO pooter.ledger_merkle_batches (day, root, claim_count)
    VALUES (${day}, ${root}, ${count})
    ON CONFLICT (day) DO NOTHING
  `;

  // Onchain leg: anchor this root and any older unanchored ones to Base.
  const { anchorPendingRoots, isAnchorConfigured } = await import(
    "@/lib/ledger/anchor-onchain"
  );
  if (!isAnchorConfigured()) {
    return NextResponse.json({
      ok: true,
      day,
      claims: count,
      root,
      anchored: [],
      note: "anchor env not configured — root stored offchain, anchorable retroactively",
    });
  }
  const { anchored, pending } = await anchorPendingRoots();
  return NextResponse.json({ ok: true, day, claims: count, root, anchored, pending });
}
