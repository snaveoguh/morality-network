import { describe, expect, it } from "vitest";
import {
  buildExactLiquidationMap,
  combineMaps,
  parseClearinghouseState,
  type HlPosition,
} from "../hl-positions";
import { buildLiquidationMap, type Candle } from "../liquidation-map";
import { parseLeaderboardSegment, parseVaultSegment } from "../hl-position-scanner";

// Trimmed from a live response (2026-10-30).
const RAW = {
  marginSummary: { accountValue: "93.32" },
  assetPositions: [
    {
      type: "oneWay",
      position: {
        coin: "xyz:NVDA",
        szi: "5.7",
        leverage: { type: "cross", value: 20 },
        entryPx: "216.66",
        liquidationPx: null,
      },
    },
    {
      type: "oneWay",
      position: {
        coin: "BTC",
        szi: "-0.5",
        leverage: { type: "isolated", value: 10 },
        entryPx: "77000",
        liquidationPx: "84000.5",
      },
    },
    { type: "oneWay", position: { coin: "ETH", szi: "0", entryPx: "3000", liquidationPx: "1" } },
    { type: "oneWay" },
  ],
};

const pos = (p: Partial<HlPosition> & Pick<HlPosition, "szi" | "liquidationPx">): HlPosition => ({
  user: "0xa",
  coin: "BTC",
  entryPx: 100,
  leverage: 10,
  marginType: "cross",
  ...p,
});

describe("parseClearinghouseState", () => {
  it("reads size, side, leverage and liquidation price", () => {
    const out = parseClearinghouseState("0xABC", RAW);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      user: "0xabc",
      coin: "xyz:NVDA",
      szi: 5.7,
      entryPx: 216.66,
      leverage: 20,
      marginType: "cross",
      liquidationPx: null,
    });
    expect(out[1]).toMatchObject({ coin: "BTC", szi: -0.5, marginType: "isolated", liquidationPx: 84000.5 });
  });

  it("returns nothing for malformed input", () => {
    expect(parseClearinghouseState("0x1", null)).toEqual([]);
    expect(parseClearinghouseState("0x1", { assetPositions: "x" })).toEqual([]);
  });
});

describe("buildExactLiquidationMap", () => {
  const positions: HlPosition[] = [
    pos({ user: "0xa", szi: 2, liquidationPx: 95 }), // long, $190 at 95
    pos({ user: "0xb", szi: 1, liquidationPx: 95.2 }), // long, same bucket
    pos({ user: "0xb", szi: -3, liquidationPx: 105 }), // short, $315 at 105
    pos({ user: "0xc", szi: 4, liquidationPx: null }), // long, no liq level
    pos({ user: "0xd", szi: 1, liquidationPx: 101 }), // long with liq above price: stale
    pos({ user: "0xe", szi: -1, liquidationPx: 200 }), // short beyond the range
    pos({ user: "0xf", coin: "ETH", szi: 9, liquidationPx: 90 }), // other coin
  ];
  const m = buildExactLiquidationMap({ coin: "BTC", price: 100, openInterest: 10, positions });

  it("sums |size| × liquidation price into buckets", () => {
    const longTotal = m.buckets.reduce((s, b) => s + b.longUsd, 0);
    const shortTotal = m.buckets.reduce((s, b) => s + b.shortUsd, 0);
    expect(longTotal).toBeCloseTo(2 * 95 + 95.2, 9);
    expect(shortTotal).toBeCloseTo(3 * 105, 9);
    const b95 = m.buckets.find((b) => b.lo <= 95 && b.hi > 95)!;
    expect(b95.longUsd).toBeCloseTo(285.2, 9);
  });

  it("reports coverage, accounts, positions without a level and stale ones", () => {
    // long 2+1+4+1 = 8, short 3+1 = 4 → 12 / (2 × 10)
    expect(m.longSize).toBe(8);
    expect(m.shortSize).toBe(4);
    expect(m.coverage).toBeCloseTo(0.6, 12);
    expect(m.accounts).toBe(5);
    expect(m.noLiquidation).toEqual({ longUsd: 400, shortUsd: 0 });
    expect(m.stale).toBe(1);
    expect(m.beyondRange).toEqual({ longUsd: 0, shortUsd: 200 });
  });

  it("caps coverage at 1", () => {
    const full = buildExactLiquidationMap({ coin: "BTC", price: 100, openInterest: 1, positions });
    expect(full.coverage).toBe(1);
  });
});

describe("combineMaps", () => {
  const candles: Candle[] = Array.from({ length: 48 }, (_, i) => ({
    t: i * 3_600_000,
    o: 100,
    h: 100.5,
    l: 99.5,
    c: 100,
    v: 10,
  }));
  const estimate = buildLiquidationMap({ coin: "BTC", price: 100, openInterest: 10, maxLeverage: 40, candles });

  it("adds real positions to the estimate scaled to the unscanned share", () => {
    const exact = buildExactLiquidationMap({
      coin: "BTC",
      price: 100,
      openInterest: 10,
      positions: [pos({ szi: 5, liquidationPx: 95 }), pos({ szi: -3, liquidationPx: 105 })],
    });
    expect(exact.coverage).toBeCloseTo(0.4, 12);
    const c = combineMaps(exact, estimate);
    expect(c.buckets).toHaveLength(estimate.buckets.length);
    for (let i = 0; i < c.buckets.length; i++) {
      const b = c.buckets[i];
      expect(b.estLongUsd).toBeCloseTo(estimate.buckets[i].longUsd * 0.6, 6);
      expect(b.longUsd).toBeCloseTo(b.exactLongUsd + b.estLongUsd, 6);
      expect(b.shortUsd).toBeCloseTo(b.exactShortUsd + b.estShortUsd, 6);
    }
    const estTotal = estimate.buckets.reduce((s, b) => s + b.longUsd, 0) + estimate.beyondRange.longUsd;
    const combinedEst = c.buckets.reduce((s, b) => s + b.estLongUsd, 0);
    expect(combinedEst + c.beyondRange.longUsd).toBeCloseTo(estTotal * 0.6, 4);
  });

  it("refuses maps on different grids", () => {
    const exact = buildExactLiquidationMap({ coin: "BTC", price: 101, openInterest: 10, positions: [] });
    expect(() => combineMaps(exact, estimate)).toThrow(/grids differ/);
  });
});

describe("stats file segments", () => {
  it("reads a leaderboard row", () => {
    const seg = `"ethAddress": "0xF5D81A135F756CA16544E53C20FC20643EC3AD53",
      "accountValue": "85882972.49",
      "windowPerformances": [
        ["day", { "pnl": "1", "roi": "0.1", "vlm": "2454354011.04" }],
        ["week", { "pnl": "1", "roi": "0.1", "vlm": "9197590592.68" }],
        ["month", { "pnl": "13358214.43", "roi": "0.18", "vlm": "34766110266.02" }],
        ["allTime", { "pnl": "1", "roi": "0.1", "vlm": "1" }]
      ], "prize": 0, "displayName": null }, {`;
    expect(parseLeaderboardSegment(seg)).toEqual({
      user: "0xf5d81a135f756ca16544e53c20fc20643ec3ad53",
      value: 85882972.49,
      volume: 34766110266.02,
    });
    expect(parseLeaderboardSegment('"x": 1')).toBeNull();
  });

  it("reads a vault row", () => {
    const seg = `"vaultAddress": "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
      "leader": "0x677d831aef5328190852e24f13c46cac05f984e7",
      "tvl": "171278476.66", "isClosed": false }`;
    expect(parseVaultSegment(seg)).toEqual({
      vault: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
      tvl: 171278476.66,
      closed: false,
    });
    expect(parseVaultSegment(seg.replace("false", "true"))?.closed).toBe(true);
  });
});
