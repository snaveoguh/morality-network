/**
 * Support and resistance: price levels where the price turned in the
 * candle window, found from swing highs and lows. Pure and deterministic.
 *
 * Method:
 * 1. A swing high is a candle whose high is the highest of the `swing`
 *    candles either side of it; a swing low likewise for lows. With 1h
 *    candles and swing = 6, a turn has to hold for 6 hours each way.
 *    Equal highs (lows) after a candle disqualify it, so a flat top counts
 *    once and a plateau still running is not a turn. Candles within
 *    `swing` of either end of the window cannot qualify.
 * 2. Swings within `tolerancePct` of the current price of each other are
 *    merged into one level (price = mean of its swings). `touches` is the
 *    number of swings in the level.
 * 3. A level below the current price is support, above is resistance,
 *    whichever kind of swing formed it (a broken high becomes support).
 * 4. Per side, levels are ranked by touches, then by nearness to price.
 *
 * These describe where the price turned before. They do not predict where
 * it will turn next.
 */

import type { Candle } from "@/lib/liquidation-map";

export interface PriceLevel {
  kind: "support" | "resistance";
  price: number;
  /** Swing highs and lows merged into this level. */
  touches: number;
  /** Open time of the most recent swing in the level, ms. */
  lastTouch: number;
}

export interface PriceLevelOptions {
  /** Candles each side a swing must beat. Default 6. */
  swing?: number;
  /** Merge distance as a fraction of current price. Default 0.006. */
  tolerancePct?: number;
  /** Levels to return per side. Default 2. */
  perSide?: number;
  /** Ignore levels further than this fraction from price. Default 0.12. */
  rangePct?: number;
}

interface Swing {
  price: number;
  t: number;
}

export function findSwings(candles: Candle[], swing: number): Swing[] {
  const out: Swing[] = [];
  for (let i = swing; i < candles.length - swing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swing; j <= i + swing && (isHigh || isLow); j++) {
      if (j === i) continue;
      // A flat top counts once, at its last candle: equal highs after the
      // candle disqualify it, so a plateau still running isn't a turn.
      if (j < i ? candles[j].h > candles[i].h : candles[j].h >= candles[i].h) isHigh = false;
      if (j < i ? candles[j].l < candles[i].l : candles[j].l <= candles[i].l) isLow = false;
    }
    if (isHigh) out.push({ price: candles[i].h, t: candles[i].t });
    if (isLow) out.push({ price: candles[i].l, t: candles[i].t });
  }
  return out;
}

export function findPriceLevels(
  candles: Candle[],
  price: number,
  opts: PriceLevelOptions = {},
): PriceLevel[] {
  const swing = opts.swing ?? 6;
  const tol = (opts.tolerancePct ?? 0.006) * price;
  const perSide = opts.perSide ?? 2;
  const range = (opts.rangePct ?? 0.12) * price;

  const swings = findSwings(candles, swing).sort((a, b) => a.price - b.price || a.t - b.t);

  // Greedy merge in price order: join the current group while within tol
  // of the group's mean.
  const groups: Swing[][] = [];
  for (const s of swings) {
    const g = groups[groups.length - 1];
    if (g) {
      const mean = g.reduce((sum, x) => sum + x.price, 0) / g.length;
      if (s.price - mean <= tol) {
        g.push(s);
        continue;
      }
    }
    groups.push([s]);
  }

  const levels: PriceLevel[] = groups
    .map((g) => {
      const p = g.reduce((sum, x) => sum + x.price, 0) / g.length;
      return {
        kind: p < price ? ("support" as const) : ("resistance" as const),
        price: p,
        touches: g.length,
        lastTouch: Math.max(...g.map((x) => x.t)),
      };
    })
    .filter((l) => Math.abs(l.price - price) <= range);

  const pick = (kind: PriceLevel["kind"]) =>
    levels
      .filter((l) => l.kind === kind)
      .sort(
        (a, b) =>
          b.touches - a.touches || Math.abs(a.price - price) - Math.abs(b.price - price),
      )
      .slice(0, perSide);

  // Highest price first, to match the chart.
  return [...pick("resistance"), ...pick("support")].sort((a, b) => b.price - a.price);
}
