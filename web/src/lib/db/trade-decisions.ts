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

// A single bad value from the composite/Kelly math must NEVER throw and lose
// the whole audit row — that was the silent open-write bug (no trade_decisions
// rows recorded since the v5 rearm; the insert threw and the caller's
// try/catch swallowed it). Two known failure modes are hardened here:
//   - a non-finite number in an integer column → "22P02 invalid input syntax"
//   - a BigInt (e.g. whale-exposure) inside entry_rationale → JSON.stringify
//     throws "Do not know how to serialize a BigInt".
const dbNum = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;
const dbInt = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;

// BigInt-safe, non-finite-safe JSON for jsonb columns. Returns null (never
// throws) so a malformed rationale degrades the metadata, not the whole row.
function dbJson(
  value: unknown,
): ReturnType<typeof sql.json> | null {
  if (value == null) return null;
  try {
    const safe = JSON.parse(
      JSON.stringify(value, (_k, v) =>
        typeof v === "bigint"
          ? v.toString()
          : typeof v === "number" && !Number.isFinite(v)
            ? null
            : v,
      ),
    );
    return sql.json(safe as Parameters<typeof sql.json>[0]);
  } catch {
    return null;
  }
}

export async function createTradeDecision(
  input: CreateTradeDecisionInput,
): Promise<TradeDecisionRow> {
  // Position ids are deterministic (`hl:{symbol}:{marketId}`), so a prior
  // trade's row can still occupy this id — the engine archives those under
  // `${id}:closed:${ts}` in Redis, but Postgres rows imported by backfills
  // never got the rename, deadlocking every future insert at this id.
  // Mirror the archive rename here before inserting.
  await sql`
    UPDATE pooter.trade_decisions
    SET id = id || ':closed:' || ((extract(epoch FROM COALESCE(closed_at, NOW())) * 1000)::bigint)::text,
        updated_at = NOW()
    WHERE id = ${input.id}
  `;
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
      ${dbInt(input.leverage)},
      ${input.openedAt},
      ${dbNum(input.entryNotionalUsd)},
      ${input.signalSource ?? null},
      ${dbNum(input.signalConfidence)},
      ${dbNum(input.kellyFraction)},
      ${dbNum(input.moralScore)},
      ${input.moralJustification ?? null},
      ${dbNum(input.stopLossPct)},
      ${dbNum(input.takeProfitPct)},
      ${dbNum(input.trailingStopPct)},
      ${dbNum(input.highWaterMark)},
      ${dbNum(input.lowWaterMark)},
      ${dbJson(input.dynamicTpLevels?.filter((n) => Number.isFinite(n)))},
      ${dbJson(input.entryRationale)}
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

/** Returns the number of rows closed (0 = no matching open row for this cloid). */
export async function closeTradeDecisionByCloid(
  cloid: string,
  input: CloseTradeDecisionInput,
): Promise<number> {
  const rows = await sql`
    UPDATE pooter.trade_decisions SET
      closed_at      = ${input.closedAt},
      exit_reason    = ${input.exitReason},
      exit_rationale = ${input.exitRationale ? sql.json(input.exitRationale as Parameters<typeof sql.json>[0]) : null},
      updated_at     = NOW()
    WHERE cloid = ${cloid}
      AND closed_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

/**
 * Fallback for positions with no cloid, or whose cloid didn't match an open
 * row. Match by (wallet, marketSymbol, openedAt) — best we can do.
 * Returns the number of rows closed.
 */
export async function closeTradeDecisionByWalletSymbolOpened(
  wallet: string,
  marketSymbol: string,
  openedAt: Date,
  input: CloseTradeDecisionInput,
): Promise<number> {
  const rows = await sql`
    UPDATE pooter.trade_decisions SET
      closed_at      = ${input.closedAt},
      exit_reason    = ${input.exitReason},
      exit_rationale = ${input.exitRationale ? sql.json(input.exitRationale as Parameters<typeof sql.json>[0]) : null},
      updated_at     = NOW()
    WHERE lower(wallet) = lower(${wallet})
      AND lower(market_symbol) = lower(${marketSymbol})
      AND opened_at = ${openedAt}
      AND closed_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

/**
 * Last-resort fallback: close the most recent open row for wallet+symbol.
 * A re-adopted position (cloid lost, openedAt regenerated by the engine)
 * matches neither the cloid nor the exact opened_at — but the engine holds at
 * most one live position per symbol, so the newest open row IS that position.
 */
export async function closeTradeDecisionByLatestOpenRow(
  wallet: string,
  marketSymbol: string,
  input: CloseTradeDecisionInput,
): Promise<number> {
  const rows = await sql`
    UPDATE pooter.trade_decisions SET
      closed_at      = ${input.closedAt},
      exit_reason    = ${input.exitReason},
      exit_rationale = ${input.exitRationale ? sql.json(input.exitRationale as Parameters<typeof sql.json>[0]) : null},
      updated_at     = NOW()
    WHERE id = (
      SELECT id FROM pooter.trade_decisions
      WHERE lower(wallet) = lower(${wallet})
        AND lower(market_symbol) = lower(${marketSymbol})
        AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
    )
    RETURNING id
  `;
  return rows.length;
}

/**
 * Close a trade_decisions row for a position/scalp: try the cloid first, then
 * fall back to wallet+symbol+openedAt if the cloid matched no open row.
 * Returns rows affected — 0 means nothing was recorded and the caller MUST log
 * loudly (the HL close already happened). Shared by the engine, scalper and
 * scout so the close-recording behaviour can't drift between them.
 */
export async function recordTradeDecisionClose(
  target: {
    cloid?: string | null;
    wallet: string;
    marketSymbol?: string | null;
    openedAt: Date;
  },
  input: CloseTradeDecisionInput,
): Promise<number> {
  let affected = 0;
  if (target.cloid) {
    affected = await closeTradeDecisionByCloid(target.cloid, input);
  }
  if (affected === 0 && target.marketSymbol) {
    affected = await closeTradeDecisionByWalletSymbolOpened(
      target.wallet,
      target.marketSymbol,
      target.openedAt,
      input,
    );
  }
  if (affected === 0 && target.marketSymbol) {
    affected = await closeTradeDecisionByLatestOpenRow(
      target.wallet,
      target.marketSymbol,
      input,
    );
  }
  return affected;
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
    WHERE lower(wallet) = lower(${wallet}) AND closed_at IS NULL
    ORDER BY opened_at DESC
  `;
}

export async function getRecentClosed(
  wallet: string,
  limit = 200,
): Promise<TradeDecisionRow[]> {
  return sql<TradeDecisionRow[]>`
    SELECT * FROM pooter.trade_decisions
    WHERE lower(wallet) = lower(${wallet}) AND closed_at IS NOT NULL
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
