import "server-only";

// Onchain leg of the daily Merkle batch: posts stored roots to LedgerAnchor
// on Base (contracts/src/LedgerAnchor.sol, deployed
// 0x1A55c83fb85D5d5Ab9415b016a47A56C0a54B99d). Activates only when
// LEDGER_ANCHOR_ADDRESS + LEDGER_ANCHOR_PRIVATE_KEY are set; without them,
// roots simply accumulate offchain (tx_hash NULL) and anchor retroactively —
// the contract accepts any not-yet-anchored day.

import {
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { sql } from "../db";

const ANCHOR_ABI = parseAbi([
  "function anchor(uint256 day, bytes32 root, uint256 claimCount) external",
]);

/** "2026-07-11" → 20260711 (the contract's day key). */
export function dayToUint(day: string): bigint {
  return BigInt(day.replace(/-/g, ""));
}

function anchorConfig(): { address: Address; key: Hex } | null {
  const address = process.env.LEDGER_ANCHOR_ADDRESS?.trim();
  const key = process.env.LEDGER_ANCHOR_PRIVATE_KEY?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) return null;
  return { address: address as Address, key: key as Hex };
}

export function isAnchorConfigured(): boolean {
  return anchorConfig() !== null;
}

/**
 * Send anchor txs for stored roots that have no tx yet, oldest day first.
 * Bounded per run; each success writes tx_hash back. Returns what happened —
 * failures leave rows untouched for the next run.
 */
export async function anchorPendingRoots(
  maxTxs = 5,
): Promise<{ anchored: Array<{ day: string; txHash: string }>; pending: number }> {
  const config = anchorConfig();
  if (!config) return { anchored: [], pending: 0 };

  const rows = await sql<
    Array<{ day: string | Date; root: string; claim_count: number }>
  >`
    SELECT day, root, claim_count FROM pooter.ledger_merkle_batches
    WHERE tx_hash IS NULL
    ORDER BY day ASC
    LIMIT ${Math.max(1, Math.min(20, maxTxs))}
  `;
  if (rows.length === 0) return { anchored: [], pending: 0 };

  const account = privateKeyToAccount(config.key);
  const rpcUrl =
    process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl, { timeout: 30_000 }),
  });

  const anchored: Array<{ day: string; txHash: string }> = [];
  for (const row of rows) {
    const day =
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10);
    try {
      const txHash = await wallet.writeContract({
        address: config.address,
        abi: ANCHOR_ABI,
        functionName: "anchor",
        args: [dayToUint(day), row.root as Hex, BigInt(row.claim_count)],
      });
      await sql`
        UPDATE pooter.ledger_merkle_batches
        SET tx_hash = ${txHash}
        WHERE day = ${day} AND tx_hash IS NULL
      `;
      anchored.push({ day, txHash });
    } catch (error) {
      // AlreadyAnchored (e.g. a prior tx landed but the write-back failed)
      // or transient RPC issues — log and let the next run retry/reconcile.
      console.error(`[ledger/anchor] tx failed for ${day}:`, error);
      break;
    }
  }

  const remaining = await sql<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM pooter.ledger_merkle_batches WHERE tx_hash IS NULL
  `;
  return { anchored, pending: remaining[0]?.n ?? 0 };
}
