#!/usr/bin/env node
// Enrich closed pooter.trade_decisions rows with realized PnL from HL fills,
// and insert synthetic rows for close events that match no row at all.
// PnL source of truth: Hyperliquid userFills (closedPnl, fee), grouped into
// close events exactly like scripts/reconcile-hl-fills.mjs.
//
// Safe by construction:
//   - only sets exit_rationale.pnlUsd where it is currently NULL (never
//     overwrites a worker-written value)
//   - synthetic inserts use ON CONFLICT (id) DO NOTHING
//   - DRY_RUN=1 prints everything and writes nothing
//
// Usage:
//   DATABASE_URL='...' node scripts/enrich-closes-from-fills.mjs [wallet] [sinceISO]

import postgres from "postgres";

const WALLET = (process.argv[2] || "0x38501DEB0984E651fE5275359904C76e6F7f764d").toLowerCase();
const SINCE = Date.parse(process.argv[3] || "2026-07-20T00:00:00Z");
const API = process.env.HYPERLIQUID_API_URL || "https://api.hyperliquid.xyz";
const MATCH_TOLERANCE_MS = 5 * 60 * 1000;
const DRY_RUN = ["1", "true", "yes"].includes((process.env.DRY_RUN ?? "").toLowerCase());

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });

async function hlFills(startTime) {
  const r = await fetch(`${API}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "userFillsByTime", user: WALLET, startTime }),
  });
  if (!r.ok) throw new Error(`HL ${r.status}: ${await r.text()}`);
  return (await r.json()).filter((f) => (f.dir || "").startsWith("Close"));
}

// Group consecutive same-coin close fills within tolerance into close events.
function groupCloses(fills) {
  fills.sort((a, b) => a.time - b.time);
  const events = [];
  for (const f of fills) {
    const last = events[events.length - 1];
    if (last && last.coin === f.coin && f.time - last.lastTime <= MATCH_TOLERANCE_MS) {
      last.closedPnl += Number(f.closedPnl);
      last.fee += Number(f.fee);
      last.lastTime = f.time;
    } else {
      events.push({
        coin: f.coin, time: f.time, lastTime: f.time,
        closedPnl: Number(f.closedPnl), fee: Number(f.fee),
        dir: f.dir, px: Number(f.px),
      });
    }
  }
  return events;
}

async function main() {
  const events = groupCloses(await hlFills(SINCE));
  console.log(`${events.length} HL close events since ${new Date(SINCE).toISOString()}`);

  const rows = await sql`
    select id, market_symbol, closed_at, exit_rationale
    from pooter.trade_decisions
    where closed_at is not null and closed_at > ${new Date(SINCE)} and wallet is distinct from 'paper'
  `;
  console.log(`${rows.length} closed DB rows in window`);

  const used = new Set();
  let enriched = 0, alreadySet = 0, inserted = 0;

  for (const ev of events) {
    // symbol forms differ in case ("XYZ:AAPL" vs "xyz:AAPL") — compare lowercased
    const match = rows.find(
      (r) =>
        !used.has(r.id) &&
        r.market_symbol.toLowerCase() === ev.coin.toLowerCase() &&
        r.closed_at &&
        Math.abs(new Date(r.closed_at).getTime() - ev.lastTime) <= MATCH_TOLERANCE_MS,
    );
    if (match) {
      used.add(match.id);
      const existing = match.exit_rationale?.pnlUsd;
      if (existing != null) { alreadySet++; continue; }
      enriched++;
      console.log(`ENRICH ${match.id}  pnl ${ev.closedPnl.toFixed(4)}  fee ${ev.fee.toFixed(4)}`);
      if (!DRY_RUN) {
        await sql`
          update pooter.trade_decisions
          set exit_rationale = coalesce(exit_rationale, '{}'::jsonb)
              || ${sql.json({ pnlUsd: ev.closedPnl, feeUsd: ev.fee, pnlSource: "hl-fills-backfill" })}
          where id = ${match.id} and (exit_rationale->>'pnlUsd') is null
        `;
      }
    } else {
      // No row at all — reconstruct a minimal closed row from the fill event.
      const id = `backfill-fill:${ev.coin}:${ev.lastTime}`;
      inserted++;
      console.log(`INSERT ${id}  pnl ${ev.closedPnl.toFixed(4)}  (${ev.dir})`);
      if (!DRY_RUN) {
        await sql`
          insert into pooter.trade_decisions
            (id, wallet, market_symbol, venue, direction, leverage,
             opened_at, closed_at, exit_reason, entry_notional_usd, exit_rationale)
          values
            (${id}, ${WALLET}, ${ev.coin}, 'hyperliquid-perp',
             ${ev.dir === "Close Short" ? "short" : "long"}, null,
             ${new Date(ev.time)}, ${new Date(ev.lastTime)}, 'backfill-from-fills', null,
             ${sql.json({ pnlUsd: ev.closedPnl, feeUsd: ev.fee, pnlSource: "hl-fills-backfill", note: "row reconstructed from HL fills; open metadata unavailable" })})
          on conflict (id) do nothing
        `;
      }
    }
  }

  console.log(`\nenriched ${enriched} · already had pnl ${alreadySet} · synthetic inserts ${inserted}${DRY_RUN ? "  [DRY RUN — nothing written]" : ""}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
