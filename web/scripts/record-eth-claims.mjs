#!/usr/bin/env node
/**
 * Record ETH entitlements from the legacy custodial wallets.
 *
 * Reads live mainnet balances for every address in account_profiles.csv,
 * matches each funded wallet to the account that owned it, and writes a
 * pooter.eth_claims row. Touches no key material — balances are public data.
 *
 *   node scripts/record-eth-claims.mjs                    # dry run
 *   DATABASE_URL='...' node scripts/record-eth-claims.mjs --commit
 *
 * Re-runnable: amounts refresh in place while a claim is still 'pending', and
 * anything already 'paid' is left alone.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";

const PROFILES = process.env.LEGACY_PROFILES_CSV || path.join(os.homedir(), "account_profiles.csv");
const RPC_URL = process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";
const COMMIT = process.argv.includes("--commit");

// email -> custodial address, straight from the legacy export.
// Columns: Id, Email, Id, Address, EncryptedPrivateKey, Salt, ...
// Columns 4 and 5 (the key blob and salt) are never read.
const wallets = [];
{
  const lines = fs.readFileSync(PROFILES, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length !== 9) throw new Error(`account_profiles.csv line ${i + 1}: expected 9 fields, got ${c.length}`);
    const email = (c[1] || "").trim().toLowerCase();
    const address = (c[3] || "").trim();
    if (email.includes("@") && /^0x[0-9a-fA-F]{40}$/.test(address)) wallets.push({ email, address });
  }
}
console.log(`legacy wallets: ${wallets.length}`);

const client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });
const observedAt = new Date();

console.log("reading mainnet balances…");
const funded = [];
let n = 0;
for (const w of wallets) {
  const balance = await client.getBalance({ address: w.address });
  if (balance > 0n) funded.push({ ...w, balance });
  if (++n % 100 === 0) process.stderr.write(`  ${n}/${wallets.length}\n`);
}

funded.sort((a, b) => (b.balance > a.balance ? 1 : -1));
const total = funded.reduce((t, w) => t + w.balance, 0n);
console.log(`\nfunded wallets: ${funded.length}`);
console.log(`total owed: ${formatEther(total)} ETH\n`);
for (const w of funded) {
  console.log(`  ${formatEther(w.balance).padStart(20)} ETH  ${w.address}  ${w.email}`);
}

if (!COMMIT) {
  console.log("\nDRY RUN — pass --commit to write pooter.eth_claims.");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

try {
  let written = 0;
  let skipped = 0;
  await sql.begin(async (tx) => {
    for (const w of funded) {
      const [account] = await tx`SELECT id FROM pooter.accounts WHERE email = ${w.email}`;
      if (!account) {
        console.warn(`  no account for ${w.email} — skipped`);
        skipped++;
        continue;
      }
      const res = await tx`
        INSERT INTO pooter.eth_claims (account_id, legacy_address, amount_wei, observed_at)
        VALUES (${account.id}, ${w.address}, ${w.balance.toString()}, ${observedAt})
        ON CONFLICT (LOWER(legacy_address)) DO UPDATE
          SET amount_wei  = EXCLUDED.amount_wei,
              observed_at = EXCLUDED.observed_at
          WHERE pooter.eth_claims.status = 'pending'
      `;
      if (res.count > 0) written++;
    }
  });
  const [sum] = await sql`
    SELECT COUNT(*)::int n, COALESCE(SUM(amount_wei), 0)::TEXT total_wei
    FROM pooter.eth_claims WHERE status = 'pending'
  `;
  console.log(`\nwrote/refreshed ${written} claims` + (skipped ? `, ${skipped} skipped` : ""));
  console.log(`pending claims: ${sum.n}, ${formatEther(BigInt(sum.total_wei))} ETH`);
} finally {
  await sql.end();
}
