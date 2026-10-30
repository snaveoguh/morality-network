/**
 * Exact liquidation levels from real Hyperliquid positions.
 *
 * Hyperliquid is on-chain, so every account's open positions are public:
 * `POST /info {type:"clearinghouseState", user}` returns each position's
 * signed size (`szi`), entry price, leverage and the exchange's own
 * `liquidationPx`. This module parses those responses and sums
 * `|size| × liquidationPx` into the same price buckets as the estimated map
 * (`liquidation-map.ts`), so the two can be shown side by side.
 *
 * Pure and deterministic: no fetches, no clock, no LLM. The scanner that
 * finds accounts and polls them is `hl-position-scanner.ts`.
 *
 * Coverage. Every perp contract has one long and one short, so if every
 * account were scanned, long size = short size = open interest (OI). The
 * share of OI the scanned accounts explain is
 *   (long size + short size) / (2 × OI)
 * and the rest of the map is left to the estimate.
 *
 * `liquidationPx` is null when the account's margin covers a move to zero
 * (or to infinity for a short). Those positions count towards coverage but
 * have no liquidation level to plot.
 */

import {
  bucketGrid,
  bucketIndex,
  gridBuckets,
  type LiquidationBucket,
  type LiquidationMap,
  type LiquidationOptions,
} from "./liquidation-map";

export interface HlPosition {
  user: string;
  /** Hyperliquid coin name, e.g. "BTC" or "xyz:NVDA". */
  coin: string;
  /** Signed size in coins: positive long, negative short. */
  szi: number;
  entryPx: number;
  leverage: number;
  marginType: "cross" | "isolated";
  /** Null when margin covers any move (no liquidation level). */
  liquidationPx: number | null;
}

interface RawAssetPosition {
  position?: {
    coin?: string;
    szi?: string;
    entryPx?: string;
    leverage?: { type?: string; value?: number };
    liquidationPx?: string | null;
  };
}

/** Positions from a `clearinghouseState` response. Skips anything malformed. */
export function parseClearinghouseState(user: string, raw: unknown): HlPosition[] {
  const list = (raw as { assetPositions?: RawAssetPosition[] } | null)?.assetPositions;
  if (!Array.isArray(list)) return [];
  const out: HlPosition[] = [];
  for (const ap of list) {
    const p = ap?.position;
    if (!p?.coin) continue;
    const szi = Number(p.szi);
    const entryPx = Number(p.entryPx);
    if (!Number.isFinite(szi) || szi === 0 || !(entryPx > 0)) continue;
    const liq = p.liquidationPx == null ? null : Number(p.liquidationPx);
    out.push({
      user: user.toLowerCase(),
      coin: p.coin,
      szi,
      entryPx,
      leverage: Number(p.leverage?.value) || 1,
      marginType: p.leverage?.type === "isolated" ? "isolated" : "cross",
      liquidationPx: liq !== null && liq > 0 && Number.isFinite(liq) ? liq : null,
    });
  }
  return out;
}

export interface ExactInput {
  coin: string;
  /** Current mark price. */
  price: number;
  /** Open interest in coins, one side (from `metaAndAssetCtxs`). */
  openInterest: number;
  /** Positions of the scanned accounts; other coins are ignored. */
  positions: readonly HlPosition[];
}

export interface ExactLiquidationMap {
  coin: string;
  price: number;
  bucketSize: number;
  /** Highest price first. Same grid as the estimated map for these options. */
  buckets: LiquidationBucket[];
  beyondRange: { longUsd: number; shortUsd: number };
  /** Distinct accounts holding this coin. */
  accounts: number;
  /** Size held by the scanned accounts, in coins. */
  longSize: number;
  shortSize: number;
  /** (long size + short size) / (2 × OI), capped at 1. */
  coverage: number;
  /** Notional at mark price of positions with no liquidation level. */
  noLiquidation: { longUsd: number; shortUsd: number };
  /**
   * Positions whose liquidation price is already on the wrong side of the
   * mark (data older than the move). Left out of the buckets.
   */
  stale: number;
}

export function buildExactLiquidationMap(
  input: ExactInput,
  opts: LiquidationOptions = {},
): ExactLiquidationMap {
  const { coin, price, openInterest } = input;
  const grid = bucketGrid(price, opts);
  const longs = new Array<number>(grid.nBuckets).fill(0);
  const shorts = new Array<number>(grid.nBuckets).fill(0);
  let longBeyond = 0;
  let shortBeyond = 0;
  let longSize = 0;
  let shortSize = 0;
  let noLiqLong = 0;
  let noLiqShort = 0;
  let stale = 0;
  const users = new Set<string>();

  for (const p of input.positions) {
    if (p.coin !== coin) continue;
    users.add(p.user);
    const size = Math.abs(p.szi);
    const isLong = p.szi > 0;
    if (isLong) longSize += size;
    else shortSize += size;

    const liq = p.liquidationPx;
    if (liq === null) {
      if (isLong) noLiqLong += size * price;
      else noLiqShort += size * price;
      continue;
    }
    if (isLong ? liq >= price : liq <= price) {
      stale++;
      continue;
    }
    const usd = size * liq;
    const idx = bucketIndex(grid, liq);
    if (idx < 0) {
      if (isLong) longBeyond += usd;
      else shortBeyond += usd;
    } else if (isLong) longs[idx] += usd;
    else shorts[idx] += usd;
  }

  const coverage =
    openInterest > 0 ? Math.min(1, (longSize + shortSize) / (2 * openInterest)) : 0;

  return {
    coin,
    price,
    bucketSize: grid.step,
    buckets: gridBuckets(grid, longs, shorts),
    beyondRange: { longUsd: longBeyond, shortUsd: shortBeyond },
    accounts: users.size,
    longSize,
    shortSize,
    coverage,
    noLiquidation: { longUsd: noLiqLong, shortUsd: noLiqShort },
    stale,
  };
}

/** One bucket of the combined map: real positions plus the estimate for the rest. */
export interface CombinedBucket extends LiquidationBucket {
  exactLongUsd: number;
  exactShortUsd: number;
  estLongUsd: number;
  estShortUsd: number;
}

export interface CombinedLiquidationMap {
  coin: string;
  price: number;
  bucketSize: number;
  /** Highest price first. longUsd/shortUsd are exact + estimated. */
  buckets: CombinedBucket[];
  beyondRange: { longUsd: number; shortUsd: number };
  /** Share of OI from real positions; the estimate is scaled to the rest. */
  coverage: number;
}

/**
 * Real positions plus the estimated map scaled down to the share of open
 * interest the scan did not reach. Both maps must be built around the same
 * price with the same options, so their grids match.
 */
export function combineMaps(
  exact: ExactLiquidationMap,
  estimate: Pick<LiquidationMap, "price" | "bucketSize" | "buckets" | "beyondRange">,
): CombinedLiquidationMap {
  if (estimate.price !== exact.price || estimate.bucketSize !== exact.bucketSize) {
    throw new Error("combineMaps: grids differ");
  }
  if (estimate.buckets.length !== exact.buckets.length) {
    throw new Error("combineMaps: grids differ");
  }
  const rest = 1 - exact.coverage;
  const buckets = exact.buckets.map((b, i): CombinedBucket => {
    const e = estimate.buckets[i];
    const estLongUsd = e.longUsd * rest;
    const estShortUsd = e.shortUsd * rest;
    return {
      lo: b.lo,
      hi: b.hi,
      exactLongUsd: b.longUsd,
      exactShortUsd: b.shortUsd,
      estLongUsd,
      estShortUsd,
      longUsd: b.longUsd + estLongUsd,
      shortUsd: b.shortUsd + estShortUsd,
    };
  });
  return {
    coin: exact.coin,
    price: exact.price,
    bucketSize: exact.bucketSize,
    buckets,
    beyondRange: {
      longUsd: exact.beyondRange.longUsd + estimate.beyondRange.longUsd * rest,
      shortUsd: exact.beyondRange.shortUsd + estimate.beyondRange.shortUsd * rest,
    },
    coverage: exact.coverage,
  };
}
