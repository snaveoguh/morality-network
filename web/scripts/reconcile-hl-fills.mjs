#!/usr/bin/env node
/**
 * HL ↔ Postgres close reconciliation (READ-ONLY).
 *
 * Diagnoses whether the trader recorded its closes. Fetches every closing fill
 * on Hyperliquid for the wallet since SINCE, and diffs against the
 * pooter.trade_decisions rows that carry a closed_at. For each HL close with no
 * matching closed row it reports whether an OPEN (unclosed) row exists for that
 * coin — distinguishing "the close-writer's UPDATE matched nothing" (row is
 * there, still open) from "no row was ever written".
 *
 * Fills are public, so the HL half needs no key. The DB half needs DATABASE_URL
 * (the indexer Postgres the worker writes to). Nothing here writes.
 *
 * Usage:
 *   DATABASE_URL='...' node scripts/reconcile-hl-fills.mjs [wallet] [sinceISO]
 *   # defaults: wallet 0x38501…764d, since 2026-07-20T00:00:00Z
 */
import postgres from "postgres";

const WALLET = (process.argv[2] || "0x38501DEB0984E651fE5275359904C76e6F7f764d").toLowerCase();
const SINCE = Date.parse(process.argv[3] || "2026-07-20T00:00:00Z");
const API = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz";
const MATCH_TOLERANCE_MS = 5 * 60 * 1000;

function fmt(t) {
  return new Date(t).toISOString().replace(".000Z", "Z");
}

async function hlFills(startTime) {
  const r = await fetch(`${API}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "userFillsByTime", user: WALLET, startTime }),
  });
  if (!r.ok) throw new Error(`HL ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// Collapse partial fills of one position-close into a single event: same coin,
// fills within 5s of each other, summed.
function groupCloses(fills) {
  const closes = fills
    .filter((f) => parseFloat(f.closedPnl ?? "0") !== 0)
    .map((f) => ({
      coin: String(f.coin ?? "").toUpperCase(),
      time: Number(f.time ?? 0),
      closedPnl: parseFloat(f.closedPnl),
      fee: parseFloat(f.fee ?? "0"),
      px: parseFloat(f.px ?? "0"),
      dir: String(f.dir ?? ""),
    }))
    .sort((a, b) => a.time - b.time);

  const events = [];
  for (const f of closes) {
    const last = events[events.length - 1];
    if (last && last.coin === f.coin && f.time - last.lastTime <= 5000) {
      last.closedPnl += f.closedPnl;
      last.fee += f.fee;
      last.lastTime = f.time;
    } else {
      events.push({ coin: f.coin, time: f.time, lastTime: f.time, closedPnl: f.closedPnl, fee: f.fee, dir: f.dir });
    }
  }
  return events;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot check the Postgres side.");
    process.exit(1);
  }
  console.log(`wallet ${WALLET}`);
  console.log(`since  ${fmt(SINCE)}\n`);

  const hlEvents = groupCloses(await hlFills(SINCE));
  const hlPnl = hlEvents.reduce((s, e) => s + e.closedPnl, 0);
  console.log(`HL close events since window: ${hlEvents.length}   net closedPnl ${hlPnl.toFixed(4)}\n`);

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    // Case-insensitive wallet match; the app stores whatever resolveHyperliquid…
    // returned, which may be checksummed.
    const closedRows = await sql`
      SELECT market_symbol, opened_at, closed_at, cloid, exit_reason,
             (exit_rationale->>'pnlUsd') AS pnl_usd
      FROM pooter.trade_decisions
      WHERE LOWER(wallet) = ${WALLET} AND closed_at IS NOT NULL
        AND closed_at >= ${new Date(SINCE)}
      ORDER BY closed_at DESC
    `;
    const openRows = await sql`
      SELECT market_symbol, opened_at, cloid
      FROM pooter.trade_decisions
      WHERE LOWER(wallet) = ${WALLET} AND closed_at IS NULL
      ORDER BY opened_at DESC
    `;
    const newestClosed = await sql`
      SELECT market_symbol, closed_at FROM pooter.trade_decisions
      WHERE LOWER(wallet) = ${WALLET} AND closed_at IS NOT NULL
      ORDER BY closed_at DESC LIMIT 1
    `;

    console.log(`DB closed rows in window: ${closedRows.length}`);
    console.log(`DB newest closed_at overall: ${newestClosed[0] ? fmt(newestClosed[0].closed_at.getTime()) + "  (" + newestClosed[0].market_symbol + ")" : "none"}`);
    console.log(`DB currently-open rows: ${openRows.length} [${openRows.map((r) => r.market_symbol).join(", ")}]\n`);

    // Match each HL close event to a DB closed row (coin + time proximity).
    const matched = [];
    const missing = [];
    for (const ev of hlEvents) {
      const hit = closedRows.find(
        (r) =>
          r.market_symbol.toUpperCase() === ev.coin &&
          Math.abs(r.closed_at.getTime() - ev.time) <= MATCH_TOLERANCE_MS,
      );
      if (hit) matched.push({ ev, hit });
      else missing.push(ev);
    }

    console.log(`=== ${matched.length} HL closes matched to a DB closed row ===`);
    for (const { ev } of matched) console.log(`  OK   ${fmt(ev.time)}  ${ev.coin}  pnl ${ev.closedPnl.toFixed(3)}`);

    console.log(`\n=== ${missing.length} HL closes MISSING from the DB closed set ===`);
    for (const ev of missing) {
      // Is there an unclosed DB row for this coin opened before the HL close?
      const openRow = openRows.find(
        (r) => r.market_symbol.toUpperCase() === ev.coin && r.opened_at.getTime() <= ev.time + MATCH_TOLERANCE_MS,
      );
      const why = openRow
        ? `row EXISTS but still open (cloid=${openRow.cloid ?? "NULL"}) → close UPDATE matched nothing`
        : `NO open row for ${ev.coin} → position may have opened without a trade_decisions row`;
      console.log(`  MISS ${fmt(ev.time)}  ${ev.coin}  pnl ${ev.closedPnl.toFixed(3)}  fee ${ev.fee.toFixed(4)}`);
      console.log(`        ${why}`);
    }

    const dbPnlInWindow = closedRows.reduce((s, r) => s + (r.pnl_usd ? Number(r.pnl_usd) : 0), 0);
    console.log(`\nrealized since window — HL: ${hlPnl.toFixed(4)}   DB(exit_rationale.pnlUsd): ${dbPnlInWindow.toFixed(4)}`);
    if (missing.length > 0) {
      console.log(`\nVERDICT: ${missing.length} close(s) executed on HL but NOT recorded as closed in Postgres.`);
      console.log(`The dashboard's realized-PnL therefore omits ${hlPnl.toFixed(2)} of recent activity.`);
    } else {
      console.log(`\nVERDICT: every HL close since the window is recorded. No recording gap.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
