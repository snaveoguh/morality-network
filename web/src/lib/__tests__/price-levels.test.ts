import { describe, expect, it } from "vitest";
import type { Candle } from "../liquidation-map";
import { findPriceLevels, findSwings } from "../price-levels";

/** Candles from a list of mid prices, each with a ±0.5 range. */
const series = (mids: number[]): Candle[] =>
  mids.map((m, i) => ({ t: i, o: m, h: m + 0.5, l: m - 0.5, c: m, v: 1 }));

// Price oscillates between ~110 and ~90 three times, ending at 100.
const zigzag = (() => {
  const up = [100, 102, 104, 106, 108, 110, 108, 106, 104, 102];
  const down = [100, 98, 96, 94, 92, 90, 92, 94, 96, 98];
  return series([...up, ...down, ...up, ...down, ...up, ...down, 100, 100, 100, 100, 100, 100]);
})();

describe("findSwings", () => {
  it("finds the turning highs and lows", () => {
    const swings = findSwings(zigzag, 3);
    const highs = swings.filter((s) => s.price === 110.5);
    const lows = swings.filter((s) => s.price === 89.5);
    expect(highs).toHaveLength(3);
    expect(lows).toHaveLength(3);
  });

  it("counts a flat top once", () => {
    const flatTop = series([1, 2, 3, 5, 5, 3, 2, 1]);
    expect(findSwings(flatTop, 2).filter((s) => s.price === 5.5)).toHaveLength(1);
  });

  it("ignores candles too close to the ends", () => {
    expect(findSwings(series([5, 4, 3, 2, 1]), 2)).toEqual([]);
  });
});

describe("findPriceLevels", () => {
  it("merges repeated turns into one level per side", () => {
    const levels = findPriceLevels(zigzag, 100, { swing: 3 });
    expect(levels).toEqual([
      { kind: "resistance", price: 110.5, touches: 3, lastTouch: 45 },
      { kind: "support", price: 89.5, touches: 3, lastTouch: 55 },
    ]);
  });

  it("classifies by position against the current price", () => {
    const levels = findPriceLevels(zigzag, 115, { swing: 3, rangePct: 0.3 });
    expect(levels.every((l) => l.kind === "support")).toBe(true);
  });

  it("drops levels outside the range", () => {
    expect(findPriceLevels(zigzag, 100, { swing: 3, rangePct: 0.05 })).toEqual([]);
  });

  it("is deterministic", () => {
    expect(findPriceLevels(zigzag, 100)).toEqual(findPriceLevels(zigzag, 100));
  });
});
