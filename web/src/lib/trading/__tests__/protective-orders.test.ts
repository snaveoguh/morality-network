import { describe, expect, it } from "vitest";
import { formatPrice } from "@nktkas/hyperliquid/utils";
import {
  buildTriggerOrderWire,
  checkLiquidationBuffer,
  estimateLiquidationPrice,
  liquidationSafeStop,
  moreProtectiveStop,
  planLiquidationSafeLeverage,
  shouldUpdateExchangeStop,
  stopPriceFromFill,
  takeProfitPriceFromFill,
  trailingStopPrice,
} from "../protective-orders";

const fmt = (px: number, sz: number) => formatPrice(px, sz, "perp");

describe("stopPriceFromFill", () => {
  it("converts leveraged-PnL stop to price for a long", () => {
    // 12% leveraged at 3x = 4% price move below the fill
    expect(stopPriceFromFill({ fillPriceUsd: 100, stopLossPct: 0.12, leverage: 3, direction: "long" })).toBeCloseTo(96, 10);
  });
  it("puts a short's stop above the fill", () => {
    expect(stopPriceFromFill({ fillPriceUsd: 100, stopLossPct: 0.12, leverage: 3, direction: "short" })).toBeCloseTo(104, 10);
  });
  it("scales with leverage (5x, 10x)", () => {
    expect(stopPriceFromFill({ fillPriceUsd: 50_000, stopLossPct: 0.12, leverage: 5, direction: "long" })).toBeCloseTo(48_800, 6);
    expect(stopPriceFromFill({ fillPriceUsd: 50_000, stopLossPct: 0.12, leverage: 10, direction: "short" })).toBeCloseTo(50_600, 6);
  });
  it("handles conviction price-space stops stored as pct × leverage", () => {
    // 2% price stop at 10x is stored as 0.2
    expect(stopPriceFromFill({ fillPriceUsd: 200, stopLossPct: 0.02 * 10, leverage: 10, direction: "long" })).toBeCloseTo(196, 10);
  });
  it("rejects bad inputs", () => {
    expect(stopPriceFromFill({ fillPriceUsd: 0, stopLossPct: 0.12, leverage: 3, direction: "long" })).toBeNull();
    expect(stopPriceFromFill({ fillPriceUsd: 100, stopLossPct: 0, leverage: 3, direction: "long" })).toBeNull();
    expect(stopPriceFromFill({ fillPriceUsd: 100, stopLossPct: 1.5, leverage: 1, direction: "long" })).toBeNull();
  });
});

describe("takeProfitPriceFromFill", () => {
  it("places the exchange TP at the software full-close tier (tp × 3)", () => {
    // 30% leveraged × 3 tiers / 3x leverage = 30% price
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 0.3, leverage: 3, direction: "long" })).toBeCloseTo(130, 10);
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 0.3, leverage: 3, direction: "short" })).toBeCloseTo(70, 10);
  });
  it("honours an explicit tier multiplier", () => {
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 0.1, leverage: 5, direction: "long", tierMultiplier: 1 })).toBeCloseTo(102, 10);
  });
  it("returns null when TP is disabled (≥999) or unset", () => {
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 999, leverage: 10, direction: "long" })).toBeNull();
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 0, leverage: 10, direction: "long" })).toBeNull();
  });
  it("returns null for a short TP at or below zero price", () => {
    expect(takeProfitPriceFromFill({ fillPriceUsd: 100, takeProfitPct: 0.5, leverage: 1, direction: "short" })).toBeNull();
  });
});

describe("trailingStopPrice", () => {
  const base = { entryPriceUsd: 100, leverage: 4, trailingStopPct: 0.08, activationPct: 0.04 };
  it("is inactive until the water mark clears activation", () => {
    // activation = 1% price at 4x
    expect(trailingStopPrice({ ...base, direction: "long", highWaterMark: 100.5 })).toBeNull();
    expect(trailingStopPrice({ ...base, direction: "short", lowWaterMark: 99.5 })).toBeNull();
  });
  it("trails a long 2% below the high-water mark (8% / 4x)", () => {
    expect(trailingStopPrice({ ...base, direction: "long", highWaterMark: 110 })).toBeCloseTo(107.8, 10);
  });
  it("trails a short 2% above the low-water mark", () => {
    expect(trailingStopPrice({ ...base, direction: "short", lowWaterMark: 90 })).toBeCloseTo(91.8, 10);
  });
});

describe("moreProtectiveStop", () => {
  it("picks higher for longs, lower for shorts, ignores nulls", () => {
    expect(moreProtectiveStop("long", 96, 98)).toBe(98);
    expect(moreProtectiveStop("short", 104, 102)).toBe(102);
    expect(moreProtectiveStop("long", null, 97)).toBe(97);
    expect(moreProtectiveStop("long", null, undefined)).toBeNull();
  });
});

describe("shouldUpdateExchangeStop (trailing-update threshold)", () => {
  it("always places when there is no current stop", () => {
    expect(shouldUpdateExchangeStop({ direction: "long", currentTriggerPx: null, nextTriggerPx: 95 })).toBe(true);
  });
  it("requires ≥0.25% improvement for a long", () => {
    expect(shouldUpdateExchangeStop({ direction: "long", currentTriggerPx: 100, nextTriggerPx: 100.2 })).toBe(false);
    expect(shouldUpdateExchangeStop({ direction: "long", currentTriggerPx: 100, nextTriggerPx: 100.25 })).toBe(true);
  });
  it("never loosens a long stop", () => {
    expect(shouldUpdateExchangeStop({ direction: "long", currentTriggerPx: 100, nextTriggerPx: 98 })).toBe(false);
  });
  it("requires ≥0.25% improvement downward for a short", () => {
    expect(shouldUpdateExchangeStop({ direction: "short", currentTriggerPx: 100, nextTriggerPx: 99.8 })).toBe(false);
    expect(shouldUpdateExchangeStop({ direction: "short", currentTriggerPx: 100, nextTriggerPx: 99.75 })).toBe(true);
    expect(shouldUpdateExchangeStop({ direction: "short", currentTriggerPx: 100, nextTriggerPx: 101 })).toBe(false);
  });
  it("respects a custom threshold", () => {
    expect(shouldUpdateExchangeStop({ direction: "long", currentTriggerPx: 100, nextTriggerPx: 100.6, minMovePct: 0.01 })).toBe(false);
  });
});

describe("estimateLiquidationPrice", () => {
  it("matches HL's isolated formula for a long", () => {
    // 10x on a 40x-max market: mmr = 1.25%; dist = (0.1 − 0.0125)/(1 − 0.0125)
    const est = estimateLiquidationPrice({ entryPriceUsd: 100, leverage: 10, direction: "long", maxLeverage: 40 });
    expect(est.maintenanceMarginRate).toBeCloseTo(0.0125, 10);
    expect(est.distancePct).toBeCloseTo(0.0875 / 0.9875, 10);
    expect(est.liquidationPriceUsd!).toBeCloseTo(100 * (1 - 0.0875 / 0.9875), 8);
  });
  it("puts a short's liquidation above entry", () => {
    const est = estimateLiquidationPrice({ entryPriceUsd: 100, leverage: 5, direction: "short", maxLeverage: 20 });
    // mmr 2.5%; dist = 0.175 / 1.025
    expect(est.liquidationPriceUsd!).toBeCloseTo(100 * (1 + 0.175 / 1.025), 8);
  });
  it("assumes max leverage = requested leverage when unknown (conservative)", () => {
    const est = estimateLiquidationPrice({ entryPriceUsd: 100, leverage: 10, direction: "long" });
    expect(est.maintenanceMarginRate).toBeCloseTo(0.05, 10);
    expect(est.distancePct).toBeCloseTo(0.05 / 0.95, 10);
  });
  it("reports zero distance when leverage exceeds maintenance", () => {
    expect(estimateLiquidationPrice({ entryPriceUsd: 100, leverage: 50, direction: "long", maxLeverage: 20 }).distancePct).toBe(0);
  });
});

describe("checkLiquidationBuffer", () => {
  it("passes when the stop is within half the liquidation distance", () => {
    const r = checkLiquidationBuffer({ entryPriceUsd: 100, stopPriceUsd: 96, liquidationPriceUsd: 90, direction: "long" });
    expect(r.ok).toBe(true);
    expect(r.ratio).toBeCloseTo(0.4, 10);
  });
  it("fails when the stop is past the buffer", () => {
    expect(checkLiquidationBuffer({ entryPriceUsd: 100, stopPriceUsd: 94, liquidationPriceUsd: 90, direction: "long" }).ok).toBe(false);
  });
  it("passes exactly at the buffer boundary", () => {
    expect(checkLiquidationBuffer({ entryPriceUsd: 100, stopPriceUsd: 95, liquidationPriceUsd: 90, direction: "long" }).ok).toBe(true);
  });
  it("fails when the stop is beyond liquidation (short)", () => {
    expect(checkLiquidationBuffer({ entryPriceUsd: 100, stopPriceUsd: 112, liquidationPriceUsd: 110, direction: "short", bufferRatio: 2 }).ok).toBe(false);
  });
  it("honours a custom buffer ratio", () => {
    expect(checkLiquidationBuffer({ entryPriceUsd: 100, stopPriceUsd: 94, liquidationPriceUsd: 90, direction: "long", bufferRatio: 0.7 }).ok).toBe(true);
  });
});

describe("planLiquidationSafeLeverage", () => {
  it("keeps leverage when the default 12%/5x stop is well inside liquidation", () => {
    const plan = planLiquidationSafeLeverage({ entryPriceUsd: 100, direction: "long", leverage: 5, stopPriceDistancePct: 0.12 / 5, maxLeverage: 40 });
    expect(plan.ok).toBe(true);
    expect(plan.leverage).toBe(5);
  });
  it("steps leverage down when the stop is too close to liquidation", () => {
    // 10x on a 10x-max market: est liq ≈ 5.26%, so a 4% price stop fails at 10x and must step down
    const plan = planLiquidationSafeLeverage({ entryPriceUsd: 100, direction: "long", leverage: 10, stopPriceDistancePct: 0.04, maxLeverage: 10 });
    expect(plan.ok).toBe(true);
    expect(plan.leverage).toBeLessThan(10);
    const est = estimateLiquidationPrice({ entryPriceUsd: 100, leverage: plan.leverage, direction: "long", maxLeverage: 10 });
    expect(0.04).toBeLessThanOrEqual(0.5 * est.distancePct + 1e-12);
    const higher = estimateLiquidationPrice({ entryPriceUsd: 100, leverage: plan.leverage + 1, direction: "long", maxLeverage: 10 });
    expect(0.04).toBeGreaterThan(0.5 * higher.distancePct);
  });
  it("refuses when no leverage ≥1x works", () => {
    const plan = planLiquidationSafeLeverage({ entryPriceUsd: 100, direction: "short", leverage: 3, stopPriceDistancePct: 0.6, maxLeverage: 3 });
    expect(plan.ok).toBe(false);
  });
});

describe("liquidationSafeStop (per-cycle)", () => {
  it("leaves a comfortable stop alone", () => {
    const r = liquidationSafeStop({ direction: "long", markPriceUsd: 100, stopPriceUsd: 95, liquidationPriceUsd: 85 });
    expect(r.breach).toBe(false);
    expect(r.stopPriceUsd).toBe(95);
  });
  it("tightens a long stop when cross-margin liq moved past it", () => {
    const r = liquidationSafeStop({ direction: "long", markPriceUsd: 100, stopPriceUsd: 95, liquidationPriceUsd: 96 });
    expect(r.breach).toBe(true);
    expect(r.stopPriceUsd).toBeCloseTo(98, 10); // half way from mark to liq
  });
  it("treats a stop sitting on top of liquidation as a breach", () => {
    const r = liquidationSafeStop({ direction: "short", markPriceUsd: 100, stopPriceUsd: 109.5, liquidationPriceUsd: 110 });
    expect(r.breach).toBe(true);
    expect(r.stopPriceUsd).toBeCloseTo(105, 10);
  });
  it("supplies a stop when none exists", () => {
    const r = liquidationSafeStop({ direction: "long", markPriceUsd: 100, stopPriceUsd: null, liquidationPriceUsd: 80 });
    expect(r.stopPriceUsd).toBeCloseTo(90, 10);
  });
  it("is a no-op without a liquidation price", () => {
    expect(liquidationSafeStop({ direction: "long", markPriceUsd: 100, stopPriceUsd: 95, liquidationPriceUsd: null }).breach).toBe(false);
  });
});

describe("buildTriggerOrderWire", () => {
  it("builds a reduce-only stop-market sell for a long", () => {
    const wire = buildTriggerOrderWire({ marketId: 0, direction: "long", size: "0.01", triggerPx: 48_800.123, tpsl: "sl", szDecimals: 5, formatPrice: fmt });
    expect(wire).toEqual({
      a: 0,
      b: false,
      p: fmt(Number(fmt(48_800.123, 5)) * 0.9, 5),
      s: "0.01",
      r: true,
      t: { trigger: { isMarket: true, triggerPx: fmt(48_800.123, 5), tpsl: "sl" } },
    });
  });
  it("builds a reduce-only take-profit buy for a short with cloid", () => {
    const wire = buildTriggerOrderWire({ marketId: 110000, direction: "short", size: "3", triggerPx: 70, tpsl: "tp", szDecimals: 2, formatPrice: fmt, cloid: "0x0123456789abcdef0123456789abcdef" });
    expect(wire.b).toBe(true);
    expect(Number(wire.p)).toBeCloseTo(77, 6);
    expect(wire.t.trigger.tpsl).toBe("tp");
    expect(wire.c).toBe("0x0123456789abcdef0123456789abcdef");
  });
});
