#!/usr/bin/env node
/**
 * build-claim-snapshot.mjs — freeze an MO claim epoch.
 *
 * Reads live balances from pooter.mo_ledger (SUM of deltas — already net of
 * any prior onchain_claim debits), joins each account's PRIMARY linked wallet
 * from pooter.account_wallets, and builds an OpenZeppelin standard Merkle tree
 * over (index, address, amountWei) leaves — the exact format
 * MoClaimDistributor.sol verifies.
 *
 * Accounts with no linked wallet are skipped (they enter a later epoch once
 * they link one). Zero/negative balances are skipped.
 *
 * Dry run by default: prints the root, total and leaf count. With --write it
 * inserts the epoch + leaves into pooter.mo_claim_epochs / mo_claim_leaves
 * and writes the full tree to claim-epoch-<N>.json for archival/anchoring.
 *
 * After --write, the operational steps are (in ONE Safe batch):
 *   1. fund the distributor with total_wei from the treasury Safe
 *   2. setRoot(<epoch>, <root>)
 *   3. setRoot(<previous epoch>, 0x0)  — retire it, balances moved trees
 *
 * Usage:
 *   DATABASE_URL=... node scripts/build-claim-snapshot.mjs --epoch 1 [--write]
 */

import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const args = process.argv.slice(2);
const epochArg = args.indexOf("--epoch");
const EPOCH = epochArg >= 0 ? Number(args[epochArg + 1]) : NaN;
const WRITE = args.includes("--write");

if (!Number.isInteger(EPOCH) || EPOCH < 1) {
  console.error("--epoch <N> (positive integer) is required");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

/** "2814063.939" MO → wei bigint (18 decimals), exact string arithmetic. */
function moToWei(mo) {
  const s = String(mo);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`unparseable MO amount: ${s}`);
  const [whole, frac = ""] = s.replace("-", "").split(".");
  if (frac.length > 18) throw new Error(`more than 18 decimal places: ${s}`);
  const wei = BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
  return s.startsWith("-") ? -wei : wei;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const existing = await sql`SELECT epoch FROM pooter.mo_claim_epochs WHERE epoch = ${EPOCH}`;
  if (existing.length > 0) {
    console.error(`epoch ${EPOCH} already exists — epochs are immutable once written`);
    process.exit(1);
  }

  const rows = await sql`
    SELECT a.id AS account_id, a.email, w.address,
           COALESCE(SUM(l.delta), 0)::text AS balance_mo
    FROM pooter.accounts a
    JOIN pooter.account_wallets w ON w.account_id = a.id AND w.is_primary
    LEFT JOIN pooter.mo_ledger l ON l.account_id = a.id
    GROUP BY a.id, a.email, w.address
    HAVING COALESCE(SUM(l.delta), 0) > 0
    ORDER BY a.id`;

  const [{ n: walletless }] = await sql`
    SELECT count(*)::int AS n FROM (
      SELECT a.id FROM pooter.accounts a
      LEFT JOIN pooter.account_wallets w ON w.account_id = a.id AND w.is_primary
      LEFT JOIN pooter.mo_ledger l ON l.account_id = a.id
      WHERE w.id IS NULL
      GROUP BY a.id
      HAVING COALESCE(SUM(l.delta), 0) > 0
    ) t`;

  if (rows.length === 0) {
    console.error("no eligible accounts (positive balance + primary wallet) — nothing to snapshot");
    console.error(`${walletless} funded account(s) have not linked a wallet yet`);
    process.exit(1);
  }

  const leaves = rows.map((r, i) => [BigInt(i), r.address, moToWei(r.balance_mo)]);
  const tree = StandardMerkleTree.of(
    leaves.map(([i, addr, wei]) => [i.toString(), addr, wei.toString()]),
    ["uint256", "address", "uint256"],
  );

  const totalWei = leaves.reduce((s, [, , wei]) => s + wei, 0n);
  console.log(`epoch:        ${EPOCH}`);
  console.log(`root:         ${tree.root}`);
  console.log(`leaves:       ${leaves.length}`);
  console.log(`total:        ${totalWei} wei (${(Number(totalWei / 10n ** 12n) / 1e6).toLocaleString()} MO)`);
  console.log(`not included: ${walletless} funded account(s) without a linked wallet`);

  if (!WRITE) {
    console.log("\ndry run — pass --write to persist the epoch");
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO pooter.mo_claim_epochs (epoch, root, total_wei, leaf_count)
      VALUES (${EPOCH}, ${tree.root}, ${totalWei.toString()}, ${leaves.length})`;
    for (const [i, v] of tree.entries()) {
      const [indexStr, address, amountWei] = v;
      const accountId = rows[Number(indexStr)].account_id;
      await tx`
        INSERT INTO pooter.mo_claim_leaves (epoch, leaf_index, account_id, address, amount_wei, proof)
        VALUES (${EPOCH}, ${Number(indexStr)}, ${accountId}, ${address}, ${amountWei},
                ${JSON.stringify(tree.getProof(i))}::jsonb)`;
    }
  });

  const dumpPath = `claim-epoch-${EPOCH}.json`;
  writeFileSync(dumpPath, JSON.stringify(tree.dump(), null, 1));
  console.log(`\nwritten: epoch ${EPOCH} (${leaves.length} leaves) to DB, tree dumped to ${dumpPath}`);
  console.log("next (ONE Safe batch): fund distributor with total_wei, setRoot(epoch, root), retire previous epoch root");
} finally {
  await sql.end();
}
