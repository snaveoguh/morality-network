import { describe, expect, it } from "vitest";
import { INFORMATIONAL_PRODUCERS } from "../db/signals";
import { toSignalRows, type LiquidationMapEntry } from "../liquidation-map-data";
import { buildLiquidationMap, type Candle } from "../liquidation-map";
import { liquidationSignal } from "../liquidation-signal";

const candles: Candle[] = Array.from({ length: 48 }, (_, i) => ({
  t: i * 3_600_000,
  o: 100,
  h: 101,
  l: 99,
  c: 100,
  v: 10,
}));
const map = buildLiquidationMap({ coin: "BTC", price: 100, openInterest: 10, maxLeverage: 40, candles });
const entry: LiquidationMapEntry = {
  label: "BTC",
  group: "crypto",
  funding: 0,
  maxLeverage: 40,
  map,
  clusters: [],
  levels: [],
  exact: null,
  signal: liquidationSignal(map),
};

describe("toSignalRows", () => {
  it("writes neutral, zero-strength rows the trader ignores", () => {
    const [row] = toSignalRows([entry], Date.UTC(2026, 9, 30, 12, 34));
    expect(row.producedBy).toBe("liquidation-map");
    expect(row.direction).toBe("neutral");
    expect(row.strength).toBe(0);
    expect(row.sourceDetail).toMatchObject({ informational: true, basis: "estimate", coverage: 0 });
    expect(INFORMATIONAL_PRODUCERS).toContain(row.producedBy);
  });

  it("keys rows by coin and hour, so repeat loads in an hour do not add rows", () => {
    const a = toSignalRows([entry], Date.UTC(2026, 9, 30, 12, 1))[0].id;
    const b = toSignalRows([entry], Date.UTC(2026, 9, 30, 12, 59))[0].id;
    const c = toSignalRows([entry], Date.UTC(2026, 9, 30, 13, 0))[0].id;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(`liqmap-BTC-${Date.UTC(2026, 9, 30, 12)}`);
  });
});
