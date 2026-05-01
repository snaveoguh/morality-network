#!/usr/bin/env node
// One-shot backfill: reads ALL Redis position stores (pooter:positions,
// pooter:v2, pooter:v3, pooter:v4, pooter:scout-positions) and writes
// closed positions into pooter.trade_decisions. Safe to re-run — uses
// ON CONFLICT (id) DO NOTHING.
//
// Usage:
//   DATABASE_URL='...' \
//   UPSTASH_REDIS_REST_URL='...' \
//   UPSTASH_REDIS_REST_TOKEN='...' \
//   WALLET='0x...' \
//   node scripts/backfill-decisions.mjs
//
// Optional:
//   DRY_RUN=1   — print what would be inserted, don't write

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const WALLET = process.env.WALLET ?? "0x38501DEB0984E651fE5275359904C76e6F7f764d";
const DRY_RUN = ["1", "true", "yes"].includes((process.env.DRY_RUN ?? "").toLowerCase());

if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
if (!UPSTASH_URL || !UPSTASH_TOKEN) { console.error("UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN required"); process.exit(1); }

const sql = postgres(DATABASE_URL, { max: 2, prepare: false });

const REDIS_KEYS = [
  "pooter:positions",
  "pooter:v2",
  "pooter:v3",
  "pooter:v4",
  "pooter:scout-positions",
];

async function redisGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = await res.json();
  if (!body.result) return [];
  try {
    const parsed = JSON.parse(body.result);
    return Array.isArray(parsed.positions) ? parsed.positions : [];
  } catch {
    return [];
  }
}

function inferDirection(pos) {
  if (pos.direction) return pos.direction;
  // Older positions might not have direction set — infer from ID or default
  if (pos.id?.includes("short")) return "short";
  return "long";
}

function inferVenue(pos) {
  if (pos.venue) return pos.venue;
  if (pos.id?.startsWith("hl:") || pos.id?.startsWith("scalp:") || pos.id?.startsWith("scout:")) return "hyperliquid-perp";
  return "unknown";
}

async function main() {
  console.log(`Backfill pooter.trade_decisions from Redis`);
  console.log(`  Wallet: ${WALLET}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log();

  // 1. Collect all positions from all Redis keys, deduplicate by ID
  const allById = new Map();
  for (const key of REDIS_KEYS) {
    const positions = await redisGet(key);
    console.log(`  ${key}: ${positions.length} positions`);
    for (const p of positions) {
      if (!p.id) continue;
      // Later keys (v4) take precedence over earlier ones
      allById.set(p.id, p);
    }
  }

  const all = Array.from(allById.values());
  const closed = all.filter((p) => p.status === "closed");
  const open = all.filter((p) => p.status === "open");

  console.log();
  console.log(`  Total unique: ${all.length} (${open.length} open, ${closed.length} closed)`);
  console.log();

  if (closed.length === 0) {
    console.log("No closed positions to backfill.");
    await sql.end();
    return;
  }

  // 2. Write each closed position to pooter.trade_decisions
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const pos of closed) {
    const direction = inferDirection(pos);
    const venue = inferVenue(pos);
    const openedAt = pos.openedAt ? new Date(pos.openedAt) : new Date();
    const closedAt = pos.closedAt ? new Date(pos.closedAt) : new Date();

    if (DRY_RUN) {
      console.log(`  [DRY] ${pos.id} | ${pos.marketSymbol ?? "?"} ${direction} | opened=${openedAt.toISOString()} closed=${closedAt.toISOString()} | exit=${pos.exitReason ?? "?"}`);
      inserted++;
      continue;
    }

    try {
      const result = await sql`
        INSERT INTO pooter.trade_decisions (
          id, cloid, wallet, market_symbol, venue, direction, leverage,
          opened_at, closed_at, entry_notional_usd,
          signal_source, signal_confidence, kelly_fraction,
          moral_score, moral_justification,
          stop_loss_pct, take_profit_pct, trailing_stop_pct,
          high_water_mark, low_water_mark,
          dynamic_tp_levels,
          entry_rationale, exit_rationale, exit_reason
        ) VALUES (
          ${pos.id},
          ${pos.cloid ?? null},
          ${WALLET},
          ${pos.marketSymbol ?? "UNKNOWN"},
          ${venue},
          ${direction},
          ${pos.leverage ?? null},
          ${openedAt},
          ${closedAt},
          ${pos.entryNotionalUsd ?? null},
          ${pos.signalSource ?? null},
          ${pos.signalConfidence ?? null},
          ${pos.kellyFraction ?? null},
          ${pos.moralScore ?? null},
          ${pos.moralJustification ?? null},
          ${pos.stopLossPct ?? null},
          ${pos.takeProfitPct ?? null},
          ${pos.trailingStopPct ?? null},
          ${pos.highWaterMark ?? null},
          ${pos.lowWaterMark ?? null},
          ${pos.dynamicTpLevels ? sql.json(pos.dynamicTpLevels) : null},
          ${pos.entryRationale ? sql.json(pos.entryRationale) : null},
          ${pos.exitRationale ? sql.json(pos.exitRationale) : null},
          ${pos.exitReason ?? "unknown"}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (result.length > 0) {
        inserted++;
      } else {
        skipped++; // already exists
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR ${pos.id}: ${err.message}`);
    }
  }

  // 3. Also backfill open positions (they exist on HL but may not be in PG yet)
  for (const pos of open) {
    const direction = inferDirection(pos);
    const venue = inferVenue(pos);
    const openedAt = pos.openedAt ? new Date(pos.openedAt) : new Date();

    if (DRY_RUN) {
      console.log(`  [DRY/open] ${pos.id} | ${pos.marketSymbol ?? "?"} ${direction} | opened=${openedAt.toISOString()}`);
      inserted++;
      continue;
    }

    try {
      const result = await sql`
        INSERT INTO pooter.trade_decisions (
          id, cloid, wallet, market_symbol, venue, direction, leverage,
          opened_at, entry_notional_usd,
          signal_source, signal_confidence, kelly_fraction,
          stop_loss_pct, take_profit_pct, trailing_stop_pct,
          high_water_mark, low_water_mark,
          dynamic_tp_levels,
          entry_rationale
        ) VALUES (
          ${pos.id},
          ${pos.cloid ?? null},
          ${WALLET},
          ${pos.marketSymbol ?? "UNKNOWN"},
          ${venue},
          ${direction},
          ${pos.leverage ?? null},
          ${openedAt},
          ${pos.entryNotionalUsd ?? null},
          ${pos.signalSource ?? null},
          ${pos.signalConfidence ?? null},
          ${pos.kellyFraction ?? null},
          ${pos.stopLossPct ?? null},
          ${pos.takeProfitPct ?? null},
          ${pos.trailingStopPct ?? null},
          ${pos.highWaterMark ?? null},
          ${pos.lowWaterMark ?? null},
          ${pos.dynamicTpLevels ? sql.json(pos.dynamicTpLevels) : null},
          ${pos.entryRationale ? sql.json(pos.entryRationale) : null}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (result.length > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR ${pos.id}: ${err.message}`);
    }
  }

  console.log();
  console.log(`Done: ${inserted} inserted, ${skipped} skipped (already exist), ${errors} errors`);

  await sql.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
