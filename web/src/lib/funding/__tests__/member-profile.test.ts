// Unit tests for groupInterestEdges — pure grouping/sorting/capping logic.
// No network access; no registry calls. Tested in isolation per the spec rule
// that the page must never break on registry downtime.

import { describe, expect, it } from "vitest";
import { groupInterestEdges } from "../member-profile";
import type { EdgeWithCategory } from "../member-profile";
import type { FundingEdge } from "../types";

let counter = 0;
function makeEdge(overrides: Partial<FundingEdge> = {}): FundingEdge {
  return {
    sourceUrl: "https://members.parliament.uk/member/1/registeredinterests",
    documentKind: "members_interest",
    from: { name: "Test Donor", role: "Company" },
    to: { name: "Test Member", role: "Commons member", parliamentMemberId: 1 },
    date: "2026-01-01",
    registryRef: String(++counter),
    ...overrides,
  };
}

function item(category: string, overrides: Partial<FundingEdge> = {}): EdgeWithCategory {
  return { category, edge: makeEdge(overrides) };
}

describe("groupInterestEdges", () => {
  it("returns an empty array for no inputs", () => {
    expect(groupInterestEdges([])).toEqual([]);
  });

  it("groups edges by category into named groups", () => {
    const items = [
      item("Employment"),
      item("Gifts"),
      item("Employment"),
    ];
    const groups = groupInterestEdges(items);
    const names = groups.map((g) => g.category);
    expect(names).toContain("Employment");
    expect(names).toContain("Gifts");
    expect(groups.find((g) => g.category === "Employment")!.edges).toHaveLength(2);
    expect(groups.find((g) => g.category === "Gifts")!.edges).toHaveLength(1);
  });

  it("sorts categories by edge count descending", () => {
    const items = [
      item("A"),
      item("B"),
      item("B"),
      item("B"),
      item("C"),
      item("C"),
    ];
    const groups = groupInterestEdges(items);
    expect(groups[0].category).toBe("B"); // 3 edges
    expect(groups[1].category).toBe("C"); // 2 edges
    expect(groups[2].category).toBe("A"); // 1 edge
  });

  it("falls back to 'Other' for empty category strings", () => {
    const items = [item(""), item("")];
    const groups = groupInterestEdges(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Other");
    expect(groups[0].edges).toHaveLength(2);
  });

  it("preserves all edge fields on the output edges", () => {
    const edge = makeEdge({ amountGbp: 5000, date: "2026-03-15", description: "Acme Ltd — £5,000.00", registryRef: "edge-42" });
    const groups = groupInterestEdges([{ category: "Employment", edge }]);
    expect(groups[0].edges[0].amountGbp).toBe(5000);
    expect(groups[0].edges[0].date).toBe("2026-03-15");
    expect(groups[0].edges[0].registryRef).toBe("edge-42");
    expect(groups[0].edges[0].description).toBe("Acme Ltd — £5,000.00");
  });

  it("produces the correct total edge count across groups", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      item(i < 4 ? "Gifts" : "Donations"),
    );
    const groups = groupInterestEdges(items);
    const total = groups.reduce((n, g) => n + g.edges.length, 0);
    expect(total).toBe(7);
    expect(groups[0].category).toBe("Gifts");     // 4 edges
    expect(groups[1].category).toBe("Donations"); // 3 edges
  });
});
