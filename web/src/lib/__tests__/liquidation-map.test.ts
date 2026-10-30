import { describe, expect, it } from "vitest";
import {
  buildLiquidationMap,
  clampMix,
  describeCluster,
  findClusters,
  formatPrice,
  formatUsdCompact,
  LEVERAGE_MIX,
  longLiqPrice,
  nextNiceStep,
  niceStep,
  shortLiqPrice,
  type Candle,
} from "../liquidation-map";

const flat = (price: number, n: number, v = 10): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * 3_600_000, o: price, h: price, l: price, c: price, v }));

describe("niceStep", () => {
  it("rounds to 1, 2, 2.5 or 5 × 10^k", () => {
    expect(niceStep(388)).toBe(500);
    expect(niceStep(11.2)).toBe(10);
    expect(niceStep(0.47)).toBe(0.5);
    expect(niceStep(2.3)).toBe(2.5);
  });
});

describe("nextNiceStep", () => {
  it("walks the ladder", () => {
    expect(nextNiceStep(1)).toBe(2);
    expect(nextNiceStep(2)).toBe(2.5);
    expect(nextNiceStep(2.5)).toBe(5);
    expect(nextNiceStep(5)).toBe(10);
  });
});

describe("clampMix", () => {
  it("merges leverage above the venue max into the max", () => {
    expect(clampMix(LEVERAGE_MIX, 25)).toEqual([
      { leverage: 5, weight: 0.3 },
      { leverage: 10, weight: 0.3 },
      { leverage: 25, weight: 0.4 },
    ]);
  });
  it("keeps the mix weights summing to 1", () => {
    const sum = LEVERAGE_MIX.reduce((s, m) => s + m.weight, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("liquidation prices", () => {
  it("long liq sits below entry, short liq above", () => {
    const mmr = 1 / 80;
    expect(longLiqPrice(100, 10, mmr)).toBeCloseTo(91.25, 10);
    expect(shortLiqPrice(100, 10, mmr)).toBeCloseTo(108.75, 10);
  });
});

describe("buildLiquidationMap", () => {
  it("puts all OI at the expected levels for a flat price history", () => {
    const map = buildLiquidationMap(
      { coin: "T", price: 100, openInterest: 1000, maxLeverage: 10, candles: flat(100, 24) },
      { mix: [{ leverage: 5, weight: 1 }], rangePct: 0.3, bucketPct: 0.01, maxBuckets: 100 },
    );
    // mmr = 5%; long liq = 100 × (1 − 0.2 + 0.05) = 85, short = 115.
    expect(map.oiUsd).toBe(100_000);
    expect(map.bucketSize).toBe(1);
    const longTotal = map.buckets.reduce((s, b) => s + b.longUsd, 0);
    const shortTotal = map.buckets.reduce((s, b) => s + b.shortUsd, 0);
    expect(longTotal).toBeCloseTo(100_000, 6);
    expect(shortTotal).toBeCloseTo(100_000, 6);
    expect(map.buckets.find((b) => b.lo === 85)?.longUsd).toBeCloseTo(100_000, 6);
    const sp = shortLiqPrice(100, 5, 0.05); // 115, up to float error
    expect(map.buckets.find((b) => b.lo <= sp && sp < b.hi)?.shortUsd).toBeCloseTo(100_000, 6);
    // Highest price first.
    expect(map.buckets[0].lo).toBeGreaterThan(map.buckets[map.buckets.length - 1].lo);
  });

  it("reports liquidations outside the range as beyond range", () => {
    const map = buildLiquidationMap(
      { coin: "T", price: 100, openInterest: 1, maxLeverage: 10, candles: flat(100, 4) },
      { mix: [{ leverage: 5, weight: 1 }], rangePct: 0.05 },
    );
    expect(map.beyondRange.longUsd).toBeCloseTo(100, 6);
    expect(map.beyondRange.shortUsd).toBeCloseTo(100, 6);
    expect(map.buckets.every((b) => b.longUsd === 0 && b.shortUsd === 0)).toBe(true);
  });

  it("drops positions whose liquidation price was touched after entry", () => {
    // Entry at 100, then a wick to 80 wipes 5x longs (liq 85) entered at 100.
    // A later entry at 90 survives: its long liq is 76.5.
    const candles: Candle[] = [
      { t: 0, o: 100, h: 100, l: 100, c: 100, v: 10 },
      { t: 1, o: 100, h: 100, l: 80, c: 90, v: 0.0001 },
      { t: 2, o: 90, h: 90, l: 90, c: 90, v: 10 },
    ];
    const map = buildLiquidationMap(
      { coin: "T", price: 90, openInterest: 10, maxLeverage: 10, candles },
      { mix: [{ leverage: 5, weight: 1 }], rangePct: 0.3, bucketPct: 0.01, maxBuckets: 100 },
    );
    const at85 = map.buckets.find((b) => b.lo === 85)!;
    expect(at85.longUsd).toBe(0);
    const longTotal = map.buckets.reduce((s, b) => s + b.longUsd, 0);
    // Rescaled: survivors carry the whole long side.
    expect(longTotal).toBeCloseTo(900, 6);
  });

  it("weights entries by dollar volume", () => {
    const candles: Candle[] = [
      { t: 0, o: 100, h: 100, l: 100, c: 100, v: 30 },
      { t: 1, o: 110, h: 110, l: 110, c: 110, v: 10 },
    ];
    const map = buildLiquidationMap(
      { coin: "T", price: 105, openInterest: 1, maxLeverage: 10, candles },
      { mix: [{ leverage: 5, weight: 1 }], rangePct: 0.3, bucketPct: 0.01, maxBuckets: 100 },
    );
    const l100 = map.buckets.find((b) => b.lo === 85)!.longUsd; // 100 × 0.85
    const l110 = map.buckets.find((b) => b.lo === 93)!.longUsd; // 110 × 0.85 = 93.5
    expect(l100 / l110).toBeCloseTo(3000 / 1100, 6);
  });

  it("caps the number of buckets", () => {
    const map = buildLiquidationMap(
      { coin: "T", price: 281, openInterest: 1, maxLeverage: 20, candles: flat(281, 24) },
      { rangePct: 0.12, maxBuckets: 50 },
    );
    expect(map.buckets.length).toBeLessThanOrEqual(52);
  });

  it("is deterministic and survives empty candles", () => {
    const input = { coin: "T", price: 50, openInterest: 5, maxLeverage: 20, candles: [] };
    const a = buildLiquidationMap(input);
    expect(a).toEqual(buildLiquidationMap(input));
    expect(a.buckets.every((b) => b.longUsd === 0 && b.shortUsd === 0)).toBe(true);
  });
});

describe("findClusters", () => {
  it("returns the heaviest non-overlapping windows per side", () => {
    const map = buildLiquidationMap(
      { coin: "T", price: 100, openInterest: 1000, maxLeverage: 10, candles: flat(100, 24) },
      { mix: [{ leverage: 5, weight: 1 }], rangePct: 0.3, bucketPct: 0.01, maxBuckets: 100 },
    );
    const clusters = findClusters(map, { width: 2, count: 1 });
    const long = clusters.find((c) => c.side === "long")!;
    const short = clusters.find((c) => c.side === "short")!;
    expect(long.usd).toBeCloseTo(100_000, 6);
    expect(long.lo <= 85 && long.hi > 85).toBe(true);
    const sp = shortLiqPrice(100, 5, 0.05);
    expect(short.lo <= sp && short.hi > sp).toBe(true);
  });
});

describe("formatting", () => {
  it("formats money compactly", () => {
    expect(formatUsdCompact(420_000_000)).toBe("$420m");
    expect(formatUsdCompact(1_234_000_000)).toBe("$1.2bn");
    expect(formatUsdCompact(35_400)).toBe("$35k");
  });
  it("formats prices to the bucket step", () => {
    expect(formatPrice(78000, 500)).toBe("$78,000");
    expect(formatPrice(2.5, 0.01)).toBe("$2.50");
    expect(formatPrice(104, 0.5)).toBe("$104.00");
    expect(formatPrice(0.0815, 0.0005)).toBe("$0.0815");
  });
  it("writes a plain callout", () => {
    expect(
      describeCluster({ side: "long", lo: 78000, hi: 79000, usd: 420e6 }, 500),
    ).toBe("≈$420m of estimated long liquidations between $78,000 and $79,000");
  });
});
