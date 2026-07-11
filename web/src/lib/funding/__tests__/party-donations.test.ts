import { describe, expect, it } from "vitest";
import { aggregateDonations } from "../party-donations";
import type { FundingEdge } from "../types";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeEdge(
  party: string,
  amountGbp: number,
  date: string,
  ref = `C${Math.random().toString(36).slice(2, 10)}`,
): FundingEdge {
  return {
    sourceUrl: `https://search.electoralcommission.org.uk/English/Donations/${ref}`,
    documentKind: "electoral_commission_donation",
    from: { name: "Test Donor Ltd", role: "Company" },
    to: { name: party, role: "Political Party" },
    amountGbp,
    date,
    registryRef: ref,
    description: "Cash donation, Q1 2026",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("aggregateDonations", () => {
  it("sums totals and counts correctly for a single party", () => {
    const edges = [
      makeEdge("Labour Party", 10_000, "2026-01-15"),
      makeEdge("Labour Party", 5_000, "2026-03-01"),
    ];
    const result = aggregateDonations(edges, "2026-07-11");
    expect(result).toHaveLength(1);
    expect(result[0].party).toBe("Labour Party");
    expect(result[0].total).toBe(15_000);
    expect(result[0].count).toBe(2);
  });

  it("filters out donations older than 12 months", () => {
    const edges = [
      makeEdge("Conservative Party", 50_000, "2024-07-10"), // 1 day before windowStart (2024-07-11)
      makeEdge("Conservative Party", 1_000, "2024-12-01"), // within window
    ];
    const result = aggregateDonations(edges, "2025-07-11");
    // 2024-07-10 < 2024-07-11 (windowStart) → excluded; 2024-12-01 included
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(1_000);
    expect(result[0].count).toBe(1);
  });

  it("sorts parties by total descending", () => {
    const edges = [
      makeEdge("Labour Party", 5_000, "2026-01-01"),
      makeEdge("Green Party", 100_000, "2026-02-01"),
      makeEdge("Liberal Democrats", 20_000, "2026-03-01"),
    ];
    const result = aggregateDonations(edges, "2026-07-11");
    expect(result.map((r) => r.party)).toEqual([
      "Green Party",
      "Liberal Democrats",
      "Labour Party",
    ]);
  });

  it("returns an empty array when given no edges", () => {
    const result = aggregateDonations([], "2026-07-11");
    expect(result).toEqual([]);
  });

  it("excludes edges with no date or a future date beyond nowIso", () => {
    const edges = [
      makeEdge("Labour Party", 10_000, ""), // empty date
      makeEdge("Labour Party", 5_000, "2030-01-01"), // future beyond now
      makeEdge("Labour Party", 2_000, "2026-06-01"), // valid
    ];
    const result = aggregateDonations(edges, "2026-07-11");
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(2_000);
  });

  it("treats missing amountGbp as 0 in totals", () => {
    const edge: FundingEdge = {
      sourceUrl: "https://search.electoralcommission.org.uk/English/Donations/C0000001",
      documentKind: "electoral_commission_donation",
      from: { name: "Anonymous", role: "Individual" },
      to: { name: "Reform UK", role: "Political Party" },
      // amountGbp intentionally absent
      date: "2026-05-01",
      registryRef: "C0000001",
    };
    const result = aggregateDonations([edge], "2026-07-11");
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(0);
    expect(result[0].count).toBe(1);
  });
});
