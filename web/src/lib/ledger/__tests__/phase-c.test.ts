import { describe, expect, it } from "vitest";
import { claimLeafHash, computeClaimsRoot, merkleRoot } from "../merkle";
import { computeCalibration, SCORE_DISPLAY_THRESHOLD } from "../score";
import type { LedgerClaim, LedgerResolution } from "../types";

function makeClaim(id: string, overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  return {
    id,
    speaker: { memberId: 1, name: "Test Member", party: "Lab", constituency: null },
    verbatimQuote: `quote ${id}`,
    normalizedClaim: `normalized ${id}`,
    claimType: "retrodictable",
    topic: "statistics",
    resolutionDue: null,
    sourceUrl: `https://hansard.parliament.uk/x#contribution-${id}`,
    contributionExternalId: id,
    utteredAt: "2026-07-08",
    context: "pmqs",
    extractedBy: { provider: "t", model: "m", version: "v" },
    occurrences: 1,
    ...overrides,
  };
}

function makeResolution(
  claimId: string,
  verdict: LedgerResolution["verdict"],
): LedgerResolution {
  return {
    id: `res-${claimId}`,
    claimId,
    verdict,
    evidence: [{ url: "https://x", excerpt: "e", kind: "ons" }],
    reasoning: "basis",
    resolvedBy: "agent:t/m@v",
    reviewedBy: "human:test",
    status: "published",
    reviewNote: null,
    createdAt: "2026-07-10T00:00:00Z",
    reviewedAt: "2026-07-10T00:00:00Z",
  };
}

describe("merkle", () => {
  it("is deterministic and order-independent", () => {
    const a = [makeClaim("a1"), makeClaim("b2"), makeClaim("c3")];
    const b = [a[2], a[0], a[1]];
    expect(computeClaimsRoot(a).root).toBe(computeClaimsRoot(b).root);
  });

  it("changes when any claim field changes", () => {
    const base = [makeClaim("a1"), makeClaim("b2")];
    const tampered = [makeClaim("a1"), makeClaim("b2", { verbatimQuote: "edited" })];
    expect(computeClaimsRoot(base).root).not.toBe(computeClaimsRoot(tampered).root);
  });

  it("handles empty and odd-sized sets", () => {
    expect(merkleRoot([])).toBeNull();
    expect(merkleRoot([claimLeafHash(makeClaim("solo"))])).toMatch(/^0x[a-f0-9]{64}$/);
    const five = ["a", "b", "c", "d", "e"].map((id) => claimLeafHash(makeClaim(id)));
    expect(merkleRoot(five)).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("calibration score gate", () => {
  it("withholds the score below the n>=20 threshold", () => {
    const claims = Array.from({ length: 25 }, (_, i) => makeClaim(`c${i}`));
    const verdicts = new Map(
      claims.slice(0, 10).map((c) => [c.id, makeResolution(c.id, "true")]),
    );
    const cal = computeCalibration(claims, verdicts);
    expect(cal.nResolved).toBe(10);
    expect(cal.scoreVisible).toBe(false);
    expect(cal.pctTrue).toBeNull();
    expect(cal.resolvedNeeded).toBe(SCORE_DISPLAY_THRESHOLD - 10);
    // Checkability rate publishes regardless of n.
    expect(cal.checkabilityRate).toBe(100);
  });

  it("publishes the score at threshold with partial = half credit", () => {
    const claims = Array.from({ length: 20 }, (_, i) => makeClaim(`c${i}`));
    const verdicts = new Map<string, LedgerResolution>();
    claims.forEach((c, i) => {
      verdicts.set(
        c.id,
        makeResolution(c.id, i < 10 ? "true" : i < 15 ? "partial" : "false"),
      );
    });
    const cal = computeCalibration(claims, verdicts);
    expect(cal.scoreVisible).toBe(true);
    // 10*1 + 5*0.5 + 5*0 = 12.5 / 20 = 62.5%
    expect(cal.pctTrue).toBe(62.5);
  });

  it("does not count published 'unresolved' verdicts as resolved", () => {
    const claims = [makeClaim("c1")];
    const verdicts = new Map([["c1", makeResolution("c1", "unresolved")]]);
    expect(computeCalibration(claims, verdicts).nResolved).toBe(0);
  });

  it("excludes unfalsifiable claims from the checkability rate", () => {
    const claims = [
      makeClaim("c1"),
      makeClaim("c2", { claimType: "unfalsifiable" }),
    ];
    expect(computeCalibration(claims, new Map()).checkabilityRate).toBe(50);
  });
});
