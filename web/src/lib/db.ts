// Postgres client singleton (using `postgres` library — Prisma deps remain
// installed but we use raw SQL for simplicity and predictability).
//
// Pooter writes trader metadata (rationale, signal source, Kelly, moral gate)
// and unified signals to Postgres on the pooter-indexer Railway project, in a
// dedicated `pooter` schema isolated from Ponder's tables.
//
// Hyperliquid is the source of truth for positions/fills/PnL/fees — this DB
// only carries data that HL can't carry. Join via `cloid` (32-byte client
// order ID echoed by HL on every fill of an order).

import postgres, { Sql } from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __pooterDb: Sql | undefined;
}

function makeClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — Pooter Postgres is required for trade decisions and signals.",
    );
  }
  return postgres(url, {
    max: 4, // generous for serverless-style request bursts
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // pgbouncer/proxy-friendly
  });
}

/**
 * Module-level singleton. The `globalThis.__pooterDb` cache prevents Next.js
 * dev mode from leaking connections on hot reload.
 */
export const sql: Sql =
  globalThis.__pooterDb ?? (globalThis.__pooterDb = makeClient());

/**
 * Returns true if DATABASE_URL is configured AND a trivial query succeeds.
 * Use this to gate code paths that should silently fall back when Postgres
 * is unreachable (e.g. dashboard rendering still works on cached HL data
 * if Postgres is down).
 */
export async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Row types — match the SQL columns. Keep these in sync with migrations.
// ─────────────────────────────────────────────────────────────────────────

export interface TradeDecisionRow {
  id: string;
  cloid: string | null;
  hl_oid: string | null;
  wallet: string;
  market_symbol: string;
  venue: string;
  direction: "long" | "short";
  leverage: number | null;
  opened_at: Date;
  closed_at: Date | null;
  entry_notional_usd: string | null; // numeric → string in postgres-js
  signal_source: string | null;
  signal_confidence: number | null;
  kelly_fraction: number | null;
  moral_score: number | null;
  moral_justification: string | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  trailing_stop_pct: number | null;
  high_water_mark: number | null;
  low_water_mark: number | null;
  dynamic_tp_levels: number[] | null;
  entry_rationale: unknown | null;
  exit_rationale: unknown | null;
  exit_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SignalRow {
  id: string;
  produced_at: Date;
  produced_by: string;
  symbol: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  score: number | null;
  claim: string | null;
  entity_hash: string | null;
  market_impact_json: unknown | null;
  cluster_id: string | null;
  contradiction_count: number | null;
  token_address: string | null;
  support_levels: number[];
  resistance_levels: number[];
  regime: string | null;
  source_detail: unknown | null;
  ttl_expires_at: Date | null;
  created_at: Date;
}
