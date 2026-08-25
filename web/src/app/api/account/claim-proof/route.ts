import { NextRequest, NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth-context";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/claim-proof — the signed-in account's MO claim data for the
 * latest epoch it appears in: leaf (index, address, amountWei), Merkle proof,
 * and the distributor address to submit against. The proof only ever pays the
 * signature-verified primary wallet recorded at snapshot time, so serving it
 * to the authenticated account holder is safe.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const distributor = process.env.NEXT_PUBLIC_MO_CLAIM_DISTRIBUTOR ?? null;

  const leaves = await sql`
    SELECT l.epoch, l.leaf_index, l.address, l.amount_wei::text AS amount_wei,
           l.proof, l.claimed_tx, l.claimed_at, e.root
    FROM pooter.mo_claim_leaves l
    JOIN pooter.mo_claim_epochs e ON e.epoch = l.epoch
    WHERE l.account_id = ${auth.accountId}
    ORDER BY l.epoch DESC
    LIMIT 1`;

  if (leaves.length === 0) {
    return NextResponse.json({ claim: null, distributor });
  }

  const leaf = leaves[0];
  return NextResponse.json({
    claim: {
      epoch: Number(leaf.epoch),
      index: leaf.leaf_index,
      address: leaf.address,
      amountWei: leaf.amount_wei,
      proof: leaf.proof,
      root: leaf.root,
      claimedTx: leaf.claimed_tx,
      claimedAt: leaf.claimed_at ? new Date(leaf.claimed_at).toISOString() : null,
    },
    distributor,
  });
}
