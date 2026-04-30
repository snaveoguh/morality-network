// trade_decisions repo — per-trade metadata that HL doesn't carry.
//
// Lifecycle:
//   1. createTradeDecision()     — at order placement (with cloid)
//   2. updateRuntimeState()      — on each scan cycle (HWM/LWM/dynamicTp)
//   3. closeTradeDecision()      — at exit
//
// Reads:
//   - getByCloid(cloid)             — join HL fill → metadata
//   - getOpenForWallet(wallet)      — open decisions for the dashboard
//   - getRecentClosed(wallet, n)    — closed history page
//
// HL is the source of truth for prices/sizes/pnl/fees/timestamps. This
// table only carries data HL can't carry: signal source, rationale, Kelly
// fraction, moral score, runtime trailing-stop state, exit reason text.

import { sql, type TradeDecisionRow } from "../db";

export type Direction = "long" | "short";

export interface CreateTradeDecisionInput {
  id: string;
  cloid?: string | null;
  hlOid?: string | null;
  wallet: string;
  marketSymbol: string;
  venue: string;
  direction: Direction;
  leverage?: number | null;
  openedAt: Date;
  entryNotionalUsd?: number | null;
  signalSource?: string | null;
  signalConfidence?: number | null;
  kellyFraction?: number | null;
  moralScore?: number | null;
  moralJustification?: string | null;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
  highWaterMark?: number | null;
  lowWaterMark?: number | null;
  dynamicTpLevels?: number[] | null;
  entryRationale?: unknown | null;
  // closedAt / exitRationale / exitReason are NOT set at create time
}

export interface UpdateRuntimeStateInput {
  highWaterMark?: number | null;
  lowWaterMark?: number | null;
  dynamicTpLevels?: number[] | null;
  hlOid?: string | null;
}

export interface CloseTradeDecisionInput {
  closedAt: Date;
  exitReason: string;
  exitRationale?: unknown | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────

export async function createTradeDecision(
  input: CreateTradeDecisionInput,
): Promise<TradeDecisionRow> {
  const rows = await sql<TradeDecisionRow[]>`
    INSERT INTO pooter.trade_decisions (
      id, cloid, hl_oid, wallet, market_symbol, venue, direction, leverage,
      opened_at, entry_notional_usd,
      signal_source, signal_confidence, kelly_fraction,
      moral_score, moral_justification,
      stop_loss_pct, take_profit_pct, trailing_stop_pct,
      high_water_mark, low_water_mark, dynamic_tp_levels,
      entry_rationale
    ) VALUES (
      ${input.id},
      ${input.cloid ?? null},
      ${input.hlOid ?? null},
      ${input.wallet},
      ${input.marketSymbol},
      ${input.venue},
      ${input.direction},
      ${input.leverage ?? null},
      ${input.openedAt},
      ${input.entryNotionalUsd ?? null},
      ${input.signalSource ?? null},
      ${input.signalConfidence ?? null},
      ${input.kellyFraction ?? null},
      ${input.moralScore ?? null},
      ${input.moralJustification ?? null},
      ${input.stopLossPct ?? null},
      ${input.takeProfitPct ?? null},
      ${input.trailingStopPct ?? null},
      ${input.highWaterMark ?? null},
      ${input.lowWaterMark ?? null},
      ${input.dynamicTpLevels ? sql.json(input.dynamicTpLevels) : null},
      ${input.entryRationale ? sql.json(input.entryRationale as Parameters<typeof sql.json>[0]) : null}
    )
    RETURNING *
  `;
  return rows[0]!;
}

export async function updateRuntimeStateByCloid(
  cloid: string,
  patch: UpdateRuntimeStateInput,
): Promise<void> {
  await sql`
    UPDATE pooter.trade_decisions SET
      high_water_mark   = COALESCE(${patch.highWaterMark ?? null}, high_water_mark),
      low_water_mark    = COALESCE(${patch.lowWaterMark ?? null}, low_water_mark),
      dynamic_tp_levels = COALESCE(${patch.dynamicTpLevels ? sql.json(patch.dynamicTpLevels) : null}::jsonb, dynamic_tp_levels),
      hl_oid            = COALESCE(${patch.hlOid ?? null}, hl_oid),
      updated_at        = NOW()
    WHERE cloid = ${cloid}
  `;
}

export async function closeTradeDecisionByCloid(
  cloid: string,
  input: CloseTradeDecisionInput,
): Promise<void> {
  await sql`
    UPDATE pooter.trade_decisions SET
      closed_at      = ${input.closedAt},
      exit_reason    = ${input.exitReason},
      exit_rationale = ${input.exitRationale ? sql.json(input.exitRationale as Parameters<typeof sql.json>[0]) : null},
      updated_at     = NOW()
    WHERE cloid = ${cloid}
      AND closed_at IS NULL
  `;
}

/**
 * Fallback for legacy positions that have no cloid (created before this
 * refactor). Match by (wallet, marketSymbol, openedAt) — best we can do.
 */
export async function closeTradeDecisionByWalletSymbolOpened(
  wallet: string,
  marketSymbol: string,
  openedAt: Date,
  input: CloseTradeDecisionInput,
): Promise<void> {
  await sql`
    UPDATE pooter.trade_decisions SET
      closed_at      = ${input.closedAt},
      exit_reason    = ${input.exitReason},
      exit_rationale = ${input.exitRationale ? sql.json(input.exitRationale as Parameters<typeof sql.json>[0]) : null},
      updated_at     = NOW()
    WHERE wallet = ${wallet}
      AND market_symbol = ${marketSymbol}
      AND opened_at = ${openedAt}
      AND closed_at IS NULL
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

export async function getByCloid(
  cloid: string,
): Promise<TradeDecisionRow | null> {
  const rows = await sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions WHERE cloid = ${cloid} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getOpenForWallet(
  wallet: string,
): Promise<TradeDecisionRow[]> {
  return sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions
    WHERE wallet = ${wallet} AND closed_at IS NULL
    ORDER BY opened_at DESC
  `;
}

export async function getRecentClosed(
  wallet: string,
  limit = 200,
): Promise<TradeDecisionRow[]> {
  return sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions
    WHERE wallet = ${wallet} AND closed_at IS NOT NULL
    ORDER BY closed_at DESC
    LIMIT ${limit}
  `;
}

/**
 * Bulk fetch — used by the metrics endpoint to fetch metadata for many
 * cloids in one query (the alternative would be N+1).
 */
export async function getByCloids(
  cloids: string[],
): Promise<Map<string, TradeDecisionRow>> {
  if (cloids.length === 0) return new Map();
  const rows = await sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions
    WHERE cloid = ANY(${cloids}::text[])
  `;
  const out = new Map<string, TradeDecisionRow>();
  for (const r of rows) {
    if (r.cloid) out.set(r.cloid, r);
  }
  return out;
}

/**
 * Best-effort match by (wallet, symbol) joining HL fills that lack our cloid
 * (legacy/manual trades). Returns most recent open decision for the symbol.
 * Used as a fallback when cloid lookup fails.
 */
export async function findOpenByWalletSymbol(
  wallet: string,
  marketSymbol: string,
): Promise<TradeDecisionRow | null> {
  const rows = await sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions
    WHERE wallet = ${wallet}
      AND market_symbol = ${marketSymbol}
      AND closed_at IS NULL
    ORDER BY opened_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Generate a fresh cloid (32-byte hex with 0x prefix).
 * HL accepts this as the `c` field on order placement and echoes it back
 * on every fill of that order, making it the canonical join key.
 */
export function newCloid(): string {
  // 16 bytes → 32 hex chars → matches HL's 16-byte (32-char) cloid spec
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
