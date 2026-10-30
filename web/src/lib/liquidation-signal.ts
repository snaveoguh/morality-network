/**
 * Liquidation-cluster signal, and the backtest that gates it.
 *
 * `liquidationSignal` reads a liquidation map (exact, estimated or the two
 * combined) and returns the nearest LARGE cluster of long liquidations below
 * the price and of short liquidations above it: how far away (% of price)
 * and how much notional. It also reports the long/short imbalance near the
 * price. Pure: no fetches, no clock, no LLM.
 *
 * The signal is INFORMATIONAL. It is written to `pooter.signals` with
 * direction "neutral", which the trader's reader skips, and nothing in
 * `lib/trading` reads it. Before anyone wires it into trade decisions it has
 * to pass `LIQ_SIGNAL_GATE` on the backtest below.
 *
 * Backtest. Hyperliquid only serves positions as they are now, so there is
 * no history of real liquidation levels. The backtest therefore replays the
 * ESTIMATED map (`buildLiquidationMap`) over Hyperliquid's 1h candles: at
 * each step it builds the map from the previous `lookback` candles only,
 * takes the signal, and checks the next `horizon` candles. Open interest
 * only scales the estimate, so a constant stands in for it. Two hypotheses:
 *
 * 1. Magnet: price reaches the nearer large cluster before the farther one
 *    more often than chance. Chance is a placebo on the same price path:
 *    the same two distances with the sides swapped (the near level put on
 *    the other side of the price). A level the market is drawn to should be
 *    reached first more often than its mirror image. Paired sign test over
 *    trials where exactly one of the two is reached first. (Comparing with
 *    the random-walk chance dFar / (dNear + dFar) is biased here: within a
 *    fixed horizon the far level often isn't reached at all, which inflates
 *    near-first among decided trials even with no effect.)
 * 2. Imbalance: when liquidations near the price are lopsided, price moves
 *    towards the heavier side (shorts above → up). Hits against 50%.
 *
 * Steps default to `stride = horizon`, so trial windows do not overlap and
 * the z-scores are not inflated by reusing the same candles.
 */

import {
  buildLiquidationMap,
  type Candle,
  type LiquidationBucket,
  type LiquidationOptions,
} from "./liquidation-map";

export interface ClusterRef {
  side: "long" | "short";
  /** Price range of the cluster. */
  lo: number;
  hi: number;
  /** Liquidation notional in the cluster, USD. */
  usd: number;
  /** Signed distance from price to the cluster's near edge, % of price. */
  distancePct: number;
  /** Share of that side's liquidation notional within the map's range. */
  share: number;
}

export interface LiquidationSignal {
  coin: string;
  price: number;
  nearestLong: ClusterRef | null;
  nearestShort: ClusterRef | null;
  /**
   * (shorts − longs) / (shorts + longs) for liquidations within ±nearPct of
   * the price, −1…1. Positive: more shorts above to be squeezed.
   */
  imbalance: number;
  nearPct: number;
}

export interface SignalOptions {
  /** Adjacent buckets per cluster window. Default 2. */
  width?: number;
  /** A window is "large" if it holds at least this share of its side. Default 0.1. */
  minShare?: number;
  /** Half-width of the imbalance band, % of price. Default 5. */
  nearPct?: number;
}

interface MapLike {
  coin: string;
  price: number;
  /** Highest price first. */
  buckets: readonly LiquidationBucket[];
}

export function liquidationSignal(map: MapLike, opts: SignalOptions = {}): LiquidationSignal {
  const width = Math.max(1, opts.width ?? 2);
  const minShare = opts.minShare ?? 0.1;
  const nearPct = opts.nearPct ?? 5;
  const { price } = map;
  const asc = [...map.buckets].reverse();

  const nearest = (side: "long" | "short"): ClusterRef | null => {
    const key = side === "long" ? "longUsd" : "shortUsd";
    const total = asc.reduce((s, b) => s + b[key], 0);
    if (!(total > 0)) return null;
    let best: ClusterRef | null = null;
    for (let s = 0; s + width <= asc.length; s++) {
      let usd = 0;
      for (let j = s; j < s + width; j++) usd += asc[j][key];
      if (usd <= 0 || usd < minShare * total) continue;
      const lo = asc[s].lo;
      const hi = asc[s + width - 1].hi;
      // Long liquidations sit below the price: the near edge is the top.
      const edge = side === "long" ? Math.min(hi, price) : Math.max(lo, price);
      const distancePct = ((edge - price) / price) * 100;
      if (!best || Math.abs(distancePct) < Math.abs(best.distancePct)) {
        best = { side, lo, hi, usd, distancePct, share: usd / total };
      }
    }
    return best;
  };

  let nearLong = 0;
  let nearShort = 0;
  const band = (price * nearPct) / 100;
  for (const b of asc) {
    const mid = (b.lo + b.hi) / 2;
    if (Math.abs(mid - price) > band) continue;
    nearLong += b.longUsd;
    nearShort += b.shortUsd;
  }
  const sum = nearLong + nearShort;

  return {
    coin: map.coin,
    price,
    nearestLong: nearest("long"),
    nearestShort: nearest("short"),
    imbalance: sum > 0 ? (nearShort - nearLong) / sum : 0,
    nearPct,
  };
}

/** "Longs: $310m at $74,000, 4.5% below. Shorts: $95m at $79,500, 2.6% above." */
export function describeSignal(s: LiquidationSignal, fmtUsd: (n: number) => string, fmtPx: (n: number) => string): string {
  const part = (c: ClusterRef | null, name: string) =>
    c
      ? `${name}: ${fmtUsd(c.usd)} at ${fmtPx(c.side === "long" ? c.hi : c.lo)}, ${Math.abs(
          c.distancePct,
        ).toFixed(1)}% ${c.side === "long" ? "below" : "above"}`
      : `${name}: no large cluster in range`;
  return `${part(s.nearestLong, "Longs")}. ${part(s.nearestShort, "Shorts")}.`;
}

// ── Backtest ────────────────────────────────────────────────────────────

export interface BacktestOptions {
  coin: string;
  /** Venue max leverage for the asset (sets the estimate's leverage clamp). */
  maxLeverage: number;
  /** Candles of history the map is built from. Default 168 (7 days of 1h). */
  lookback?: number;
  /** Candles checked after each signal. Default 24. */
  horizon?: number;
  /** Candles between trials. Default = horizon (no overlap). */
  stride?: number;
  /** Minimum |imbalance| to count as an imbalance call. Default 0.2. */
  minImbalance?: number;
  signal?: SignalOptions;
  map?: LiquidationOptions;
}

export type MagnetOutcome = "near" | "far" | "neither" | "both";

/** Which of two levels (below and above the price) the path reaches first. */
export function firstTouch(
  future: readonly Candle[],
  below: number,
  above: number,
): "below" | "above" | "neither" | "both" {
  for (const k of future) {
    const hitBelow = k.l <= below;
    const hitAbove = k.h >= above;
    if (hitBelow && hitAbove) return "both";
    if (hitBelow) return "below";
    if (hitAbove) return "above";
  }
  return "neither";
}

export interface BacktestTrial {
  t: number;
  price: number;
  signal: LiquidationSignal;
  /** Null unless both sides had a large cluster. */
  magnet: { nearSide: "long" | "short"; outcome: MagnetOutcome; placebo: MagnetOutcome } | null;
  /** Close-to-close return over the horizon, %. */
  returnPct: number;
}

export interface BacktestResult {
  coin: string;
  from: number;
  to: number;
  trials: number;
  magnet: {
    /** Trials with a large cluster on both sides. */
    trials: number;
    /** Near cluster reached first. */
    nearFirst: number;
    /** Mirrored near level reached first (the placebo). */
    placeboNearFirst: number;
    /** Trials where only the real near cluster was reached first. */
    wins: number;
    /** Trials where only the mirrored level was reached first. */
    losses: number;
    /** (wins − losses) / √(wins + losses). */
    z: number;
  };
  imbalance: {
    calls: number;
    hits: number;
    hitRate: number;
    /** Mean return in the called direction, %. */
    meanReturnPct: number;
    z: number;
  };
}

export function backtestLiquidationSignal(candles: readonly Candle[], opts: BacktestOptions): BacktestResult {
  const lookback = opts.lookback ?? 168;
  const horizon = opts.horizon ?? 24;
  const stride = Math.max(1, opts.stride ?? horizon);
  const minImbalance = opts.minImbalance ?? 0.2;

  const trials: BacktestTrial[] = [];
  for (let i = lookback - 1; i + horizon < candles.length; i += stride) {
    const window = candles.slice(i - lookback + 1, i + 1);
    const price = candles[i].c;
    if (!(price > 0)) continue;
    const map = buildLiquidationMap(
      { coin: opts.coin, price, openInterest: 1, maxLeverage: opts.maxLeverage, candles: window },
      opts.map,
    );
    const signal = liquidationSignal(map, opts.signal);
    const future = candles.slice(i + 1, i + 1 + horizon);
    const returnPct = ((future[future.length - 1].c - price) / price) * 100;

    let magnet: BacktestTrial["magnet"] = null;
    const { nearestLong: L, nearestShort: S } = signal;
    if (L && S) {
      const dLong = price - Math.min(L.hi, price);
      const dShort = Math.max(S.lo, price) - price;
      const nearSide = dLong <= dShort ? "long" : "short";
      // Long liquidations sit below the price, shorts above.
      const real = firstTouch(future, price - dLong, price + dShort);
      const mirror = firstTouch(future, price - dShort, price + dLong);
      const asOutcome = (r: ReturnType<typeof firstTouch>, nearBelow: boolean): MagnetOutcome =>
        r === "neither" || r === "both" ? r : (r === "below") === nearBelow ? "near" : "far";
      magnet = {
        nearSide,
        outcome: asOutcome(real, nearSide === "long"),
        placebo: asOutcome(mirror, nearSide !== "long"),
      };
    }
    trials.push({ t: candles[i].t, price, signal, magnet, returnPct });
  }
  return summarise(opts.coin, trials, minImbalance);
}

export function summarise(coin: string, trials: readonly BacktestTrial[], minImbalance = 0.2): BacktestResult {
  let magnetTrials = 0;
  let nearFirst = 0;
  let placeboNearFirst = 0;
  let wins = 0;
  let losses = 0;
  let calls = 0;
  let hits = 0;
  let signedSum = 0;
  for (const tr of trials) {
    if (tr.magnet) {
      magnetTrials++;
      const a = tr.magnet.outcome === "near";
      const b = tr.magnet.placebo === "near";
      if (a) nearFirst++;
      if (b) placeboNearFirst++;
      if (a && !b) wins++;
      if (b && !a) losses++;
    }
    const imb = tr.signal.imbalance;
    if (Math.abs(imb) >= minImbalance && tr.returnPct !== 0) {
      calls++;
      const dir = Math.sign(imb);
      if (Math.sign(tr.returnPct) === dir) hits++;
      signedSum += dir * tr.returnPct;
    }
  }
  return {
    coin,
    from: trials[0]?.t ?? 0,
    to: trials[trials.length - 1]?.t ?? 0,
    trials: trials.length,
    magnet: {
      trials: magnetTrials,
      nearFirst,
      placeboNearFirst,
      wins,
      losses,
      z: wins + losses ? (wins - losses) / Math.sqrt(wins + losses) : 0,
    },
    imbalance: {
      calls,
      hits,
      hitRate: calls ? hits / calls : 0,
      meanReturnPct: calls ? signedSum / calls : 0,
      z: calls ? (hits - calls / 2) / Math.sqrt(calls / 4) : 0,
    },
  };
}

/**
 * What the backtest must show before the signal may feed trade decisions.
 * Per hypothesis, pooled over coins: z ≥ minZ over at least minTrials
 * trials, and the edge in the same direction on a majority of coins.
 */
export const LIQ_SIGNAL_GATE = { minZ: 2, minTrials: 300 } as const;

export interface GateVerdict {
  hypothesis: "magnet" | "imbalance";
  trials: number;
  z: number;
  coinsPositive: number;
  coins: number;
  pass: boolean;
}

export function gateVerdicts(results: readonly BacktestResult[]): GateVerdict[] {
  const coins = results.length;
  // Magnet: pooled paired sign test against the mirrored placebo.
  const mTrials = results.reduce((s, r) => s + r.magnet.trials, 0);
  const mWins = results.reduce((s, r) => s + r.magnet.wins, 0);
  const mLosses = results.reduce((s, r) => s + r.magnet.losses, 0);
  const mZ = mWins + mLosses ? (mWins - mLosses) / Math.sqrt(mWins + mLosses) : 0;
  const mPos = results.filter((r) => r.magnet.wins > r.magnet.losses).length;
  // Imbalance: pooled hits against 50%.
  const iCalls = results.reduce((s, r) => s + r.imbalance.calls, 0);
  const iHits = results.reduce((s, r) => s + r.imbalance.hits, 0);
  const iZ = iCalls ? (iHits - iCalls / 2) / Math.sqrt(iCalls / 4) : 0;
  const iPos = results.filter((r) => r.imbalance.hits > r.imbalance.calls / 2).length;
  const verdict = (
    hypothesis: GateVerdict["hypothesis"],
    trials: number,
    z: number,
    coinsPositive: number,
  ): GateVerdict => ({
    hypothesis,
    trials,
    z,
    coinsPositive,
    coins,
    pass:
      trials >= LIQ_SIGNAL_GATE.minTrials && z >= LIQ_SIGNAL_GATE.minZ && coinsPositive * 2 > coins,
  });
  return [verdict("magnet", mTrials, mZ, mPos), verdict("imbalance", iCalls, iZ, iPos)];
}
