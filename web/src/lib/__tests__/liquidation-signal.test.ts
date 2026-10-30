import { describe, expect, it } from "vitest";
import type { Candle, LiquidationBucket } from "../liquidation-map";
import {
  backtestLiquidationSignal,
  describeSignal,
  firstTouch,
  gateVerdicts,
  LIQ_SIGNAL_GATE,
  liquidationSignal,
  summarise,
  type BacktestResult,
  type BacktestTrial,
} from "../liquidation-signal";

/** Buckets of width 1 from 90 to 110, highest first, with given sums. */
function buckets(longs: Record<number, number>, shorts: Record<number, number>): LiquidationBucket[] {
  const out: LiquidationBucket[] = [];
  for (let lo = 109; lo >= 90; lo--) {
    out.push({ lo, hi: lo + 1, longUsd: longs[lo] ?? 0, shortUsd: shorts[lo] ?? 0 });
  }
  return out;
}

describe("liquidationSignal", () => {
  const map = {
    coin: "BTC",
    price: 100,
    buckets: buckets({ 99: 1, 97: 50, 92: 100 }, { 101: 2, 104: 80, 108: 20 }),
  };

  it("returns the nearest large cluster on each side", () => {
    const s = liquidationSignal(map, { width: 1 });
    // 99 holds 1/151 of longs: too small. 97 is the nearest large one.
    expect(s.nearestLong).toMatchObject({ side: "long", lo: 97, hi: 98, usd: 50 });
    expect(s.nearestLong!.distancePct).toBeCloseTo(-2, 10);
    expect(s.nearestLong!.share).toBeCloseTo(50 / 151, 10);
    expect(s.nearestShort).toMatchObject({ side: "short", lo: 104, hi: 105, usd: 80 });
    expect(s.nearestShort!.distancePct).toBeCloseTo(4, 10);
  });

  it("measures imbalance near the price", () => {
    const s = liquidationSignal(map, { width: 1, nearPct: 5 });
    // Within ±5: longs 1 + 50 = 51; shorts 2 + 80 = 82.
    expect(s.imbalance).toBeCloseTo((82 - 51) / 133, 10);
  });

  it("returns nulls and zero imbalance for an empty map", () => {
    const s = liquidationSignal({ coin: "X", price: 100, buckets: buckets({}, {}) });
    expect(s).toMatchObject({ nearestLong: null, nearestShort: null, imbalance: 0 });
  });

  it("describes itself in plain words", () => {
    const s = liquidationSignal(map, { width: 1 });
    expect(describeSignal(s, (n) => `$${n}`, (p) => `$${p}`)).toBe(
      "Longs: $50 at $98, 2.0% below. Shorts: $80 at $104, 4.0% above.",
    );
  });
});

describe("backtestLiquidationSignal", () => {
  // A deterministic zig-zag so clusters form on both sides and get reached.
  const candles: Candle[] = Array.from({ length: 600 }, (_, i) => {
    const c = 100 * (1 + 0.06 * Math.sin(i / 9) + 0.01 * Math.sin(i / 2.3));
    return { t: i * 3_600_000, o: c, h: c * 1.004, l: c * 0.996, c, v: 1000 };
  });

  it("only looks back: trials use candles up to their own time", () => {
    const r = backtestLiquidationSignal(candles, { coin: "T", maxLeverage: 50 });
    // (600 − 168 − 24) / 24 + 1 non-overlapping trials.
    expect(r.trials).toBe(Math.floor((600 - 168 - 24) / 24) + 1);
    expect(r.from).toBe(candles[167].t);
    // A later candle outside every trial's window changes nothing.
    const extra = [...candles, { t: 600 * 3_600_000, o: 1, h: 500, l: 1, c: 1, v: 1e9 }];
    expect(backtestLiquidationSignal(extra, { coin: "T", maxLeverage: 50 })).toEqual(r);
  });

  it("produces finite statistics", () => {
    const r = backtestLiquidationSignal(candles, { coin: "T", maxLeverage: 50 });
    expect(Number.isFinite(r.magnet.z)).toBe(true);
    expect(Number.isFinite(r.imbalance.z)).toBe(true);
    expect(r.magnet.nearFirst).toBeLessThanOrEqual(r.magnet.trials);
    expect(r.magnet.wins + r.magnet.losses).toBeLessThanOrEqual(r.magnet.trials);
  });
});

describe("firstTouch", () => {
  const k = (l: number, h: number): Candle => ({ t: 0, o: 100, h, l, c: 100, v: 1 });
  it("reports the first level reached", () => {
    expect(firstTouch([k(99, 101), k(97, 100)], 98, 103)).toBe("below");
    expect(firstTouch([k(99, 103.5), k(90, 100)], 98, 103)).toBe("above");
    expect(firstTouch([k(97, 104)], 98, 103)).toBe("both");
    expect(firstTouch([k(99, 101)], 98, 103)).toBe("neither");
  });
});

describe("summarise", () => {
  type O = "near" | "far" | "neither";
  const trial = (outcome: O, placebo: O, imbalance = 0, returnPct = 1): BacktestTrial => ({
    t: 0,
    price: 100,
    signal: { coin: "X", price: 100, nearestLong: null, nearestShort: null, imbalance, nearPct: 5 },
    magnet: { nearSide: "long", outcome, placebo },
    returnPct,
  });

  it("scores the magnet against the mirrored placebo on the same path", () => {
    const r = summarise("X", [
      trial("near", "far"), // win
      trial("near", "neither"), // win
      trial("far", "near"), // loss
      trial("near", "near"), // tie
      trial("neither", "neither"),
    ]);
    expect(r.magnet).toEqual({
      trials: 5,
      nearFirst: 3,
      placeboNearFirst: 2,
      wins: 2,
      losses: 1,
      z: 1 / Math.sqrt(3),
    });
  });

  it("scores imbalance calls in the called direction", () => {
    const r = summarise("X", [
      trial("neither", "neither", 0.5, 2),
      trial("neither", "neither", -0.5, 1),
      trial("neither", "neither", 0.1, 5),
    ]);
    expect(r.imbalance).toMatchObject({ calls: 2, hits: 1, hitRate: 0.5 });
    expect(r.imbalance.meanReturnPct).toBeCloseTo((2 - 1) / 2, 12);
  });
});

describe("gateVerdicts", () => {
  const result = (trials: number, wins: number, losses: number, calls: number, hits: number): BacktestResult => ({
    coin: "X",
    from: 0,
    to: 0,
    trials,
    magnet: { trials, nearFirst: 0, placeboNearFirst: 0, wins, losses, z: 0 },
    imbalance: { calls, hits, hitRate: hits / calls, meanReturnPct: 0, z: 0 },
  });

  it("fails with too few trials even when the edge is large", () => {
    const [m] = gateVerdicts([result(50, 40, 0, 50, 25)]);
    expect(m.trials).toBeLessThan(LIQ_SIGNAL_GATE.minTrials);
    expect(m.pass).toBe(false);
  });

  it("passes only with enough trials, z ≥ 2 and a majority of coins agreeing", () => {
    const strong = result(200, 40, 15, 200, 100);
    const [m, i] = gateVerdicts([strong, strong]);
    expect(m.z).toBeCloseTo(50 / Math.sqrt(110), 12);
    expect(m.pass).toBe(true);
    expect(i.pass).toBe(false);
    const [m2] = gateVerdicts([strong, result(200, 10, 12, 200, 100)]);
    expect(m2.coinsPositive).toBe(1);
    expect(m2.pass).toBe(false);
  });
});
