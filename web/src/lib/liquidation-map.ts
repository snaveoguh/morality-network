/**
 * Liquidation map: an ESTIMATE of where leveraged positions would be
 * liquidated, built from open interest and recent prices.
 *
 * Exchanges do not publish positions or liquidation prices, so every number
 * here is modelled. Pure and deterministic: no fetches, no clock, no LLM.
 * The data layer is `liquidation-map-data.ts`.
 *
 * Method (the usual public "liquidation heatmap" approach):
 *
 * 1. Size. Open interest (OI) is counted one side, and every perp contract
 *    has one long and one short, so long notional = short notional =
 *    OI × mark price. The long/short split is exact, not assumed.
 * 2. Entry prices. We assume today's open positions were opened during the
 *    lookback window (7 days of 1h candles by default), in proportion to
 *    each candle's dollar volume, at the candle's typical price
 *    (high + low + close) / 3. Positions older than the window are treated
 *    as if they were opened inside it.
 * 3. Leverage. Each entry is spread across LEVERAGE_MIX. Leverage above the
 *    venue's max for that asset is clamped to the max (its weight moves
 *    there).
 * 4. Liquidation price (isolated margin, fees and funding ignored):
 *      long  = entry × (1 − 1/L + mmr)
 *      short = entry × (1 + 1/L − mmr)
 *    where mmr is the maintenance margin rate. Hyperliquid sets it to half
 *    the initial margin at max leverage: mmr = 1 / (2 × maxLeverage).
 *    Larger positions use tiered margin; we ignore tiers.
 * 5. Survivors. A position whose liquidation price has already been
 *    touched since its entry candle (later candle low ≤ long liq, or high
 *    ≥ short liq), or is on the wrong side of the current price, is assumed
 *    already closed and dropped. Each side is then rescaled so the
 *    surviving positions add up to today's OI, because OI only counts open
 *    positions.
 * 6. Buckets. Liquidation notional is summed into fixed price buckets
 *    within ±rangePct of the current price; the rest is reported as
 *    "beyond range".
 */

export interface Candle {
  /** Open time, ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume in base units (coins, shares). */
  v: number;
}

export interface LeverageWeight {
  leverage: number;
  weight: number;
}

/**
 * Assumed leverage mix. Weights sum to 1. Most retail perp positions sit at
 * low-to-mid leverage; a thin tail runs very high. This is a judgement, not
 * measured data, and is printed on the page.
 */
export const LEVERAGE_MIX: readonly LeverageWeight[] = [
  { leverage: 5, weight: 0.3 },
  { leverage: 10, weight: 0.3 },
  { leverage: 25, weight: 0.25 },
  { leverage: 50, weight: 0.1 },
  { leverage: 100, weight: 0.05 },
];

export interface LiquidationInput {
  coin: string;
  /** Current mark price. */
  price: number;
  /** Open interest in base units, one side. */
  openInterest: number;
  /** Venue max leverage for this asset. */
  maxLeverage: number;
  /** Oldest first. */
  candles: Candle[];
}

export interface LiquidationOptions {
  /** Half-width of the bucketed range as a fraction of price. Default 0.12. */
  rangePct?: number;
  /** Target bucket width as a fraction of price before rounding. Default 0.005. */
  bucketPct?: number;
  /** Widen the bucket step until the range has at most this many buckets. Default 50. */
  maxBuckets?: number;
  mix?: readonly LeverageWeight[];
}

export interface LiquidationBucket {
  /** Inclusive lower edge. */
  lo: number;
  /** Exclusive upper edge. */
  hi: number;
  longUsd: number;
  shortUsd: number;
}

export interface LiquidationCluster {
  side: "long" | "short";
  lo: number;
  hi: number;
  usd: number;
}

export interface LiquidationMap {
  coin: string;
  price: number;
  /** OI × price: the notional on each side. */
  oiUsd: number;
  bucketSize: number;
  /** Highest price first. */
  buckets: LiquidationBucket[];
  /** Estimated liquidation notional outside the bucketed range. */
  beyondRange: { longUsd: number; shortUsd: number };
  /** Mix after clamping to max leverage. */
  mix: LeverageWeight[];
  maintenanceMarginRate: number;
  lookback: { from: number; to: number; candles: number };
}

/** Round a raw step to the nearest of 1, 2, 2.5, 5 × 10^k (log scale). */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) throw new Error("niceStep: raw must be positive");
  const exp = Math.floor(Math.log10(raw));
  let best = 0;
  let bestDist = Infinity;
  for (const k of [exp - 1, exp, exp + 1]) {
    for (const m of [1, 2, 2.5, 5]) {
      const c = m * 10 ** k;
      const d = Math.abs(Math.log(c / raw));
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
  }
  // Strip float noise such as 0.30000000000000004.
  return Number(best.toPrecision(6));
}

/** The next step up in the 1, 2, 2.5, 5 × 10^k ladder. */
export function nextNiceStep(step: number): number {
  return niceStep(step * 1.6);
}

/** Clamp each leverage to maxLeverage, merging weights that land together. */
export function clampMix(mix: readonly LeverageWeight[], maxLeverage: number): LeverageWeight[] {
  const merged = new Map<number, number>();
  for (const { leverage, weight } of mix) {
    const lev = Math.min(leverage, maxLeverage);
    merged.set(lev, (merged.get(lev) ?? 0) + weight);
  }
  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([leverage, weight]) => ({ leverage, weight: Number(weight.toFixed(9)) }));
}

export function longLiqPrice(entry: number, leverage: number, mmr: number): number {
  return entry * (1 - 1 / leverage + mmr);
}

export function shortLiqPrice(entry: number, leverage: number, mmr: number): number {
  return entry * (1 + 1 / leverage - mmr);
}

export function buildLiquidationMap(
  input: LiquidationInput,
  opts: LiquidationOptions = {},
): LiquidationMap {
  const { coin, price, openInterest, maxLeverage } = input;
  const rangePct = opts.rangePct ?? 0.12;
  const bucketPct = opts.bucketPct ?? 0.005;
  const mix = clampMix(opts.mix ?? LEVERAGE_MIX, maxLeverage);
  const mmr = 1 / (2 * maxLeverage);
  const oiUsd = openInterest * price;

  const candles = input.candles.filter(
    (k) => k.v > 0 && k.h > 0 && k.l > 0 && k.c > 0 && Number.isFinite(k.v),
  );

  const maxBuckets = opts.maxBuckets ?? 50;
  let step = niceStep(price * bucketPct);
  while ((2 * rangePct * price) / step > maxBuckets) step = nextNiceStep(step);
  const lowEdge = Math.floor((price * (1 - rangePct)) / step) * step;
  const highEdge = Math.ceil((price * (1 + rangePct)) / step) * step;
  const nBuckets = Math.max(1, Math.round((highEdge - lowEdge) / step));
  const longByBucket = new Array<number>(nBuckets).fill(0);
  const shortByBucket = new Array<number>(nBuckets).fill(0);
  let longBeyond = 0;
  let shortBeyond = 0;

  // Lowest low / highest high strictly after each candle.
  const n = candles.length;
  const minLowAfter = new Array<number>(n).fill(Infinity);
  const maxHighAfter = new Array<number>(n).fill(-Infinity);
  for (let i = n - 2; i >= 0; i--) {
    minLowAfter[i] = Math.min(minLowAfter[i + 1], candles[i + 1].l);
    maxHighAfter[i] = Math.max(maxHighAfter[i + 1], candles[i + 1].h);
  }

  const totalVol = candles.reduce((s, k) => s + k.v * ((k.h + k.l + k.c) / 3), 0);

  // Surviving (liq price, raw weight) pairs per side, rescaled after.
  const longs: Array<[number, number]> = [];
  const shorts: Array<[number, number]> = [];
  let longMass = 0;
  let shortMass = 0;

  if (totalVol > 0) {
    for (let i = 0; i < n; i++) {
      const k = candles[i];
      const entry = (k.h + k.l + k.c) / 3;
      const w = (k.v * entry) / totalVol;
      for (const { leverage, weight } of mix) {
        const ww = w * weight;
        const lp = longLiqPrice(entry, leverage, mmr);
        if (lp < price && minLowAfter[i] > lp) {
          longs.push([lp, ww]);
          longMass += ww;
        }
        const sp = shortLiqPrice(entry, leverage, mmr);
        if (sp > price && maxHighAfter[i] < sp) {
          shorts.push([sp, ww]);
          shortMass += ww;
        }
      }
    }
  }

  const place = (liq: number, usd: number, side: "long" | "short") => {
    const idx = Math.floor((liq - lowEdge) / step);
    if (idx < 0 || idx >= nBuckets) {
      if (side === "long") longBeyond += usd;
      else shortBeyond += usd;
      return;
    }
    if (side === "long") longByBucket[idx] += usd;
    else shortByBucket[idx] += usd;
  };
  for (const [lp, ww] of longs) place(lp, (ww / longMass) * oiUsd, "long");
  for (const [sp, ww] of shorts) place(sp, (ww / shortMass) * oiUsd, "short");

  const buckets: LiquidationBucket[] = [];
  for (let i = nBuckets - 1; i >= 0; i--) {
    const lo = Number((lowEdge + i * step).toPrecision(12));
    buckets.push({
      lo,
      hi: Number((lo + step).toPrecision(12)),
      longUsd: longByBucket[i],
      shortUsd: shortByBucket[i],
    });
  }

  return {
    coin,
    price,
    oiUsd,
    bucketSize: step,
    buckets,
    beyondRange: { longUsd: longBeyond, shortUsd: shortBeyond },
    mix,
    maintenanceMarginRate: mmr,
    lookback: { from: n ? candles[0].t : 0, to: n ? candles[n - 1].t : 0, candles: n },
  };
}

/**
 * Biggest clusters per side: the `count` highest-total windows of `width`
 * adjacent buckets, not overlapping. Ties go to the window nearer the price.
 */
export function findClusters(
  map: LiquidationMap,
  opts: { width?: number; count?: number } = {},
): LiquidationCluster[] {
  const width = opts.width ?? 2;
  const count = opts.count ?? 2;
  // Ascending price for windowing.
  const asc = [...map.buckets].reverse();
  const out: LiquidationCluster[] = [];

  for (const side of ["short", "long"] as const) {
    const key = side === "long" ? "longUsd" : "shortUsd";
    const windows: Array<{ start: number; usd: number; dist: number }> = [];
    for (let s = 0; s + width <= asc.length; s++) {
      let usd = 0;
      for (let j = s; j < s + width; j++) usd += asc[j][key];
      if (usd <= 0) continue;
      const mid = (asc[s].lo + asc[s + width - 1].hi) / 2;
      windows.push({ start: s, usd, dist: Math.abs(mid - map.price) });
    }
    windows.sort((a, b) => b.usd - a.usd || a.dist - b.dist);
    const taken: number[] = [];
    for (const w of windows) {
      if (taken.length >= count) break;
      if (taken.some((t) => Math.abs(t - w.start) < width)) continue;
      taken.push(w.start);
      out.push({ side, lo: asc[w.start].lo, hi: asc[w.start + width - 1].hi, usd: w.usd });
    }
  }
  return out;
}

/** "$420m", "$1.2bn", "$35k". */
export function formatUsdCompact(usd: number): string {
  const a = Math.abs(usd);
  if (a >= 1e9) return `$${trim(usd / 1e9)}bn`;
  if (a >= 1e6) return `$${trim(usd / 1e6)}m`;
  if (a >= 1e3) return `$${trim(usd / 1e3)}k`;
  return `$${Math.round(usd)}`;
}

function trim(x: number): string {
  return Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, "");
}

/** Price with decimals that suit its size (or the bucket step, if given). */
export function formatPrice(p: number, step?: number): string {
  let decimals: number;
  if (step !== undefined) {
    const s = step.toString();
    decimals = s.includes(".") ? s.split(".")[1].length : 0;
    // $104.50 rather than $104.5.
    if (decimals > 0 && p < 1000) decimals = Math.max(decimals, 2);
  } else {
    decimals = p >= 1000 ? 0 : p >= 1 ? 2 : 4;
  }
  return `$${p.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** "≈$420m of estimated long liquidations between $78,000 and $79,000". */
export function describeCluster(c: LiquidationCluster, step: number): string {
  return `≈${formatUsdCompact(c.usd)} of estimated ${c.side} liquidations between ${formatPrice(
    c.lo,
    step,
  )} and ${formatPrice(c.hi, step)}`;
}
