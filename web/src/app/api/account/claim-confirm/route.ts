import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

import { getAuthContext } from "@/lib/auth-context";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAIMED_EVENT = parseAbiItem(
  "event Claimed(uint256 indexed epoch, uint256 indexed index, address indexed account, uint256 amount)",
);

/**
 * POST /api/account/claim-confirm { txHash } — verify the onchain Claimed
 * event for the signed-in account's leaf and append the balancing mo_ledger
 * debit (reason 'onchain_claim', ref 'tx:<hash>') so the platform balance and
 * the onchain balance never double-count. Idempotent per transaction.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const accountId = auth.accountId;

  const distributor = process.env.NEXT_PUBLIC_MO_CLAIM_DISTRIBUTOR;
  if (!distributor) {
    return NextResponse.json({ error: "Claiming is not open yet" }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { txHash?: string } | null;
  const txHash = body?.txHash;
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }

  const leaves = await sql`
    SELECT l.epoch, l.leaf_index, l.address, l.amount_wei::text AS amount_wei, l.claimed_tx
    FROM pooter.mo_claim_leaves l
    WHERE l.account_id = ${accountId}
    ORDER BY l.epoch DESC
    LIMIT 1`;
  if (leaves.length === 0) {
    return NextResponse.json({ error: "No claim for this account" }, { status: 404 });
  }
  const leaf = leaves[0];
  if (leaf.claimed_tx) {
    return NextResponse.json({ ok: true, alreadyRecorded: true, txHash: leaf.claimed_tx });
  }

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org"),
  });

  const receipt = await client
    .getTransactionReceipt({ hash: txHash as `0x${string}` })
    .catch(() => null);
  if (!receipt || receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction not found or not successful" }, { status: 422 });
  }

  const logs = await client.getLogs({
    address: distributor as `0x${string}`,
    event: CLAIMED_EVENT,
    args: {
      epoch: BigInt(leaf.epoch),
      index: BigInt(leaf.leaf_index),
      account: leaf.address as `0x${string}`,
    },
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });
  const match = logs.find((log) => log.transactionHash.toLowerCase() === txHash.toLowerCase());
  if (!match) {
    return NextResponse.json(
      { error: "No matching Claimed event in that transaction" },
      { status: 422 },
    );
  }

  // Debit exactly the claimed amount in MO (wei → NUMERIC MO via /1e18 in SQL,
  // exact — NUMERIC division by a power of ten is lossless).
  const ref = `tx:${txHash.toLowerCase()}`;
  await sql.begin(async (tx) => {
    const dup = await tx`
      SELECT id FROM pooter.mo_ledger
      WHERE account_id = ${accountId} AND reason = 'onchain_claim' AND ref = ${ref}`;
    if (dup.length === 0) {
      await tx`
        INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
        VALUES (${accountId},
                -(${leaf.amount_wei}::numeric / 1e18),
                'onchain_claim', ${ref})`;
    }
    await tx`
      UPDATE pooter.mo_claim_leaves
      SET claimed_tx = ${txHash.toLowerCase()}, claimed_at = NOW()
      WHERE epoch = ${leaf.epoch} AND account_id = ${accountId} AND claimed_tx IS NULL`;
  });

  return NextResponse.json({ ok: true, txHash: txHash.toLowerCase() });
}
