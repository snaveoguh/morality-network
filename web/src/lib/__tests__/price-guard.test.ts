import { describe, expect, it } from "vitest";
import { stripStalePrices } from "../price-guard";

const live = { bitcoin: 112_400, ethereum: 3_980, solana: 188 };

describe("stripStalePrices", () => {
  it("drops the 2026-10-29 opium-edition sentence with mid-2023 prices", () => {
    const text =
      "Treasury sanctioned 11 entities linked to a $2.3 billion scheme. Bitcoin’s market sentiment sits at 62, with the price hovering around $31,800, while Ethereum remains near $1,950, indicating limited investor confidence. Google cut capex by $3 billion.";
    const out = stripStalePrices(text, live);
    expect(out.removed).toHaveLength(1);
    expect(out.text).not.toMatch(/31,800/);
    expect(out.text).toMatch(/\$2\.3 billion/);
    expect(out.text).toMatch(/Google cut capex/);
  });

  it("keeps prices within tolerance, including k shorthand", () => {
    const text = "Bitcoin traded at $110,900. Ether held near $4k. Solana rose to $191.";
    expect(stripStalePrices(text, live).removed).toEqual([]);
  });

  it("drops a 16%-off Ether price on its own (29 Oct: $1,950 vs $2,326 live)", () => {
    expect(stripStalePrices("Ethereum remains near $1,950.", { ethereum: 2_326 }).removed).toHaveLength(1);
  });

  it("drops a price when there is no live price for that asset", () => {
    expect(stripStalePrices("Bitcoin sat at $112,000.", {}).removed).toHaveLength(1);
  });

  it("ignores flows in millions and billions", () => {
    const text = "Bitcoin ETFs took in $540 million on Tuesday. Ethereum treasuries hold $12bn.";
    expect(stripStalePrices(text, {}).removed).toEqual([]);
  });

  it("leaves sentences without a tracked asset alone", () => {
    const text = "The farmer earned $1,200 from one sack. Solar output rose.";
    expect(stripStalePrices(text, {}).text).toBe(text);
  });
});
