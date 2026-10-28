import { describe, expect, it } from "vitest";
import { contentHash } from "../hash";
import {
  citeStat,
  computeAllStats,
  computeStat,
  isIsoDate,
  oneYearBefore,
  type StatInputs,
} from "../stats";
import type { InterestData, StoredVersion } from "../types";

let rowId = 0;
function interest(
  id: number,
  partial: Partial<InterestData>,
  retrievedAt = "2026-01-01T00:00:00Z",
  version = 1,
  isRemoved = false,
): StoredVersion<"mp_interests"> {
  const data: InterestData = {
    memberId: 1,
    interestId: id,
    parentInterestId: null,
    categoryId: null,
    categoryNumber: "3",
    categoryName: null,
    summary: `entry ${id}`,
    payerOrDonorName: null,
    payerFromParent: false,
    counterpartyKind: "unknown",
    valueGbp: null,
    valueAmount: null,
    valueCurrency: null,
    isRegularPayment: false,
    receivedDate: null,
    startDate: null,
    endDate: null,
    registrationDate: "2025-12-01",
    publishedDate: null,
    updatedDates: [],
    rectified: false,
    rectifiedDetails: null,
    fields: [],
    ...partial,
  };
  if (data.valueGbp && !partial.valueAmount) {
    data.valueAmount = data.valueGbp;
    data.valueCurrency = "GBP";
  }
  return {
    table: "mp_interests",
    scopeKey: "member:1",
    sourceRecordId: String(id),
    data,
    contentHash: contentHash(data),
    sourceUrl: "https://members.parliament.uk/member/1/registeredinterests",
    sourceApiUrl: `https://interests-api.parliament.uk/api/v1/Interests/${id}`,
    parserVersion: "t",
    rawFetchId: 1,
    rowId: ++rowId,
    version,
    isRemoved,
    retrievedAt,
  };
}

function inputs(interests: StoredVersion<"mp_interests">[], checkedAt = "2026-01-01T00:00:00Z"): StatInputs {
  return {
    memberId: 1,
    memberName: "A Member",
    interests,
    donations: [],
    ecLinks: [],
    checks: [{ source: "interests", scopeKey: "member:1", checkedAt }],
    claims: [],
  };
}

const SITE = "https://pooter.world";

describe("interests value stats", () => {
  const rows = [
    interest(1, { categoryNumber: "3", valueGbp: "0.10" }),
    interest(2, { categoryNumber: "3", valueGbp: "0.20" }),
    interest(3, { categoryNumber: "1.1", parentInterestId: 9, valueGbp: "1000.00" }),
    interest(9, { categoryNumber: "1" }), // parent, no value by design
    interest(4, { categoryNumber: "1.2", valueGbp: "5000.00", isRegularPayment: true }),
    interest(5, { categoryNumber: "4" }), // visit with no value
    interest(6, { categoryNumber: "5", valueAmount: "100.00", valueCurrency: "USD" }),
    interest(7, { categoryNumber: "3", valueGbp: "50.00", registrationDate: "2024-01-01" }), // out of 12m window
  ];

  it("sums exactly, by category, with every exclusion stated", () => {
    const s = computeStat("interests-value-12m", inputs(rows), "2026-06-30", SITE);
    expect(s.available).toBe(true);
    expect(s.valuePence).toBe(100030);
    expect(s.headline).toBe("£1,000.30");
    expect(s.breakdown.map((b) => [b.key, b.display])).toEqual([["1", "£1,000.00"], ["3", "£0.30"]]);
    expect(s.notes).toEqual([
      "1 entry has no stated value and is not included.",
      "1 ongoing employment agreement (category 1.2, per-period values) not included.",
      "Not converted and not included: USD 100.00 (entry 6).",
    ]);
    expect(s.rowsUsed.map((r) => r.sourceRecordId).sort()).toEqual(["1", "2", "3"]);
    expect(s.window).toEqual({ from: "2025-06-30", fromInclusive: false, to: "2026-06-30", basis: "register registration date" });
  });

  it("uses an exclusive lower bound for 12 months and inclusive for the Parliament window", () => {
    const edge = [interest(1, { valueGbp: "1.00", registrationDate: "2025-06-30" }), interest(2, { valueGbp: "2.00", registrationDate: "2024-07-04" })];
    expect(computeStat("interests-value-12m", inputs(edge), "2026-06-30", SITE).valuePence).toBe(0);
    expect(computeStat("interests-value-parliament", inputs(edge), "2026-06-30", SITE).valuePence).toBe(300);
  });

  it("is reproducible: later versions and removals do not change an earlier as-of", () => {
    const v1 = interest(1, { valueGbp: "100.00" }, "2026-01-01T00:00:00Z", 1);
    const v2 = interest(1, { valueGbp: "150.00" }, "2026-03-01T00:00:00Z", 2);
    const v3 = interest(1, { valueGbp: "150.00" }, "2026-05-01T00:00:00Z", 3, true);
    const all = inputs([v1, v2, v3]);
    expect(computeStat("interests-value-12m", all, "2026-02-01", SITE).headline).toBe("£100.00");
    expect(computeStat("interests-value-12m", all, "2026-04-01", SITE).headline).toBe("£150.00");
    expect(computeStat("interests-value-12m", all, "2026-06-01", SITE).headline).toBe("£0.00");
    expect(computeStat("interests-value-12m", all, "2026-02-01", SITE)).toEqual(
      computeStat("interests-value-12m", all, "2026-02-01", SITE),
    );
  });

  it("is unavailable before any complete register check", () => {
    const s = computeStat("interests-value-12m", inputs(rows, "2026-07-01T00:00:00Z"), "2026-06-30", SITE);
    expect(s.available).toBe(false);
    expect(s.citation).toBe("");
  });

  it("counts top-level entries only", () => {
    const s = computeStat("interests-count", inputs(rows), "2026-06-30", SITE);
    expect(s.count).toBe(7); // 8 rows minus the child payment
  });
});

describe("claims stat", () => {
  it("counts only verdicts published by the as-of date", () => {
    const s = computeStat(
      "claims-by-status",
      {
        ...inputs([]),
        claims: [
          { claimId: "a", createdAt: "2026-01-01T00:00:00Z", claimType: "retrodictable", verdict: "true", verdictPublishedAt: "2026-02-01T00:00:00Z" },
          { claimId: "b", createdAt: "2026-01-01T00:00:00Z", claimType: "retrodictable", verdict: "false", verdictPublishedAt: "2026-05-01T00:00:00Z" },
          { claimId: "c", createdAt: "2026-04-01T00:00:00Z", claimType: "predictive", verdict: null, verdictPublishedAt: null },
        ],
      },
      "2026-03-01",
      SITE,
    );
    expect(s.headline).toBe("2");
    expect(s.breakdown.map((b) => [b.label, b.count])).toEqual([
      ["Checkable now — Resolved true", 1],
      ["Checkable now — Unresolved", 1],
    ]);
  });
});

describe("citation + permalink", () => {
  it("produces the spec citation format", () => {
    const s = computeStat("interests-value-12m", inputs([interest(1, { valueGbp: "61.50" })]), "2026-10-28", SITE);
    expect(s.permalink).toBe("https://pooter.world/mp/1/stats/interests-value-12m?asOf=2026-10-28");
    expect(s.apiUrl).toBe("https://pooter.world/api/mp/1/stats/interests-value-12m?asOf=2026-10-28");
    expect(s.citation).toBe(
      `pooter world MP Record, "Registered payments, gifts and donations with a stated value, last 12 months" for A Member (1): £61.50, as of 28 October 2026. Source: Register of Members' Financial Interests. https://pooter.world/mp/1/stats/interests-value-12m?asOf=2026-10-28`,
    );
    expect(citeStat(s)).toBe(s.citation);
  });

  it("every stat carries methodology", () => {
    for (const s of computeAllStats(inputs([]), "2026-10-28", SITE)) {
      expect(s.methodology.length).toBeGreaterThan(0);
      expect(s.source).toBeTruthy();
    }
  });

  it("validates dates and handles 29 February", () => {
    expect(oneYearBefore("2028-02-29")).toBe("2027-02-28");
    expect(oneYearBefore("2026-10-28")).toBe("2025-10-28");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-10-28")).toBe(true);
    expect(() => computeStat("interests-count", inputs([]), "28/10/2026", SITE)).toThrow();
  });
});
