#!/usr/bin/env node
/**
 * Seed pooter.accounts + pooter.mo_ledger from the reconciled legacy ledger.
 *
 *   node scripts/build-legacy-ledger.mjs        # produce scripts/out/legacy-ledger.json
 *   DATABASE_URL='...' node scripts/seed-legacy-accounts.mjs --dry-run
 *   DATABASE_URL='...' node scripts/seed-legacy-accounts.mjs --commit
 *
 * Idempotent. Accounts upsert on email; the opening credit is guarded by the
 * partial unique index mo_ledger_legacy_once_idx, so re-running can never
 * double-credit anyone.
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const LEDGER = path.join(process.cwd(), "scripts", "out", "legacy-ledger.json");
const COMMIT = process.argv.includes("--commit");

if (!fs.existsSync(LEDGER)) {
  console.error(`Missing ${LEDGER}. Run: node scripts/build-legacy-ledger.mjs`);
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const accounts = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
const funded = accounts.filter((a) => a.openingMo > 0);
const totalMo = accounts.reduce((t, a) => t + a.openingMo, 0);

console.log(`legacy ledger: ${accounts.length} accounts, ${funded.length} funded, ${totalMo.toFixed(8)} MO`);
if (!COMMIT) console.log("DRY RUN — pass --commit to write. Nothing will be changed.\n");

const sql = postgres(url, { max: 1 });

try {
  await sql.begin(async (tx) => {
    let inserted = 0;
    let credited = 0;

    for (const a of accounts) {
      const [row] = await tx`
        INSERT INTO pooter.accounts
          (email, legacy_address, legacy_source, legacy_mainnet_mo, legacy_eth)
        VALUES
          (${a.email}, ${a.legacyAddress}, ${a.source},
           ${a.legacyMainnetMo}, ${a.legacyEth})
        ON CONFLICT (email) DO UPDATE
          SET legacy_address    = EXCLUDED.legacy_address,
              legacy_source     = EXCLUDED.legacy_source,
              legacy_mainnet_mo = EXCLUDED.legacy_mainnet_mo,
              legacy_eth        = EXCLUDED.legacy_eth
        RETURNING id, (xmax = 0) AS is_new
      `;
      if (row.is_new) inserted++;

      if (a.openingMo > 0) {
        const res = await tx`
          INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
          VALUES (${row.id}, ${a.openingMo}, 'legacy_migration', ${a.source})
          ON CONFLICT (account_id) WHERE reason = 'legacy_migration' DO NOTHING
        `;
        if (res.count > 0) credited++;
      }
    }

    const [tot] = await tx`
      SELECT COUNT(*)::int AS accounts,
             COUNT(*) FILTER (WHERE balance_mo > 0)::int AS funded,
             COALESCE(SUM(balance_mo), 0) AS total_mo
      FROM pooter.mo_balances
    `;

    console.log(`accounts inserted this run: ${inserted}`);
    console.log(`opening credits applied:    ${credited}`);
    console.log(`\nafter seed: ${tot.accounts} accounts, ${tot.funded} funded, ${tot.total_mo} MO`);

    if (!COMMIT) {
      console.log("\nrolling back (dry run)");
      throw new Error("__DRY_RUN__");
    }
  });
  console.log("\ncommitted.");
} catch (err) {
  if (err instanceof Error && err.message === "__DRY_RUN__") {
    console.log("dry run complete — no changes written.");
  } else {
    console.error("seed failed:", err);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
