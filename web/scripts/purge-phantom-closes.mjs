#!/usr/bin/env node
/**
 * purge-phantom-closes.mjs — one-off cleanup of phantom "disappeared from HL"
 * rows in pooter.trade_decisions.
 *
 * Background (2026-08-24): a failed builder-dex clearinghouseState fetch was
 * treated as "no positions", so the engine mass-closed real open positions as
 * "manual (disappeared from HL)" and re-adopted them on the next successful
 * poll. 75% of the closed-trade table is this churn, not real trades.
 *
 * Phantom definition (conservative):
 *   - exit_rationale->>'trigger' LIKE 'manual (disappeared%'  (the sweep's note)
 *   - signal_source IS NULL  (row was ADOPTED from HL state, not a signal entry)
 * Rows with a signal_source are real entries whose close may have been
 * mis-recorded — those are kept.
 *
 * Every purged row is copied to pooter.trade_decisions_phantom_archive first,
 * so this is reversible.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/purge-phantom-closes.mjs           # dry run
 *   DATABASE_URL=... node scripts/purge-phantom-closes.mjs --execute
 */

import postgres from "postgres";

const EXECUTE = process.argv.includes("--execute");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const WHERE = sql`
  exit_rationale->>'trigger' LIKE 'manual (disappeared%'
  AND signal_source IS NULL
`;

try {
  const [{ n: total }] = await sql`SELECT count(*)::int n FROM pooter.trade_decisions`;
  const [{ n: phantom }] = await sql`SELECT count(*)::int n FROM pooter.trade_decisions WHERE ${WHERE}`;
  const bySymbol = await sql`
    SELECT market_symbol, count(*)::int n
    FROM pooter.trade_decisions WHERE ${WHERE}
    GROUP BY 1 ORDER BY n DESC LIMIT 15`;

  console.log(`trade_decisions total: ${total}`);
  console.log(`phantom (adopted + disappeared-close): ${phantom}`);
  console.table(bySymbol.map((r) => ({ symbol: r.market_symbol, rows: r.n })));

  if (!EXECUTE) {
    console.log("\nDry run — pass --execute to archive + delete these rows.");
  } else {
    await sql.begin(async (tx) => {
      await tx`
        CREATE TABLE IF NOT EXISTS pooter.trade_decisions_phantom_archive
        (LIKE pooter.trade_decisions INCLUDING ALL)`;
      const archived = await tx`
        INSERT INTO pooter.trade_decisions_phantom_archive
        SELECT * FROM pooter.trade_decisions WHERE ${WHERE}
        ON CONFLICT DO NOTHING
        RETURNING id`;
      const deleted = await tx`
        DELETE FROM pooter.trade_decisions WHERE ${WHERE}
        RETURNING id`;
      console.log(`archived ${archived.length}, deleted ${deleted.length}`);
    });
    const [{ n: remaining }] = await sql`SELECT count(*)::int n FROM pooter.trade_decisions`;
    console.log(`trade_decisions now: ${remaining} rows`);
  }
} finally {
  await sql.end();
}
