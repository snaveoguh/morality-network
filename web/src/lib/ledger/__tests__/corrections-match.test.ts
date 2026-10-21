import { describe, expect, it } from "vitest";
import type { MinisterialCorrection } from "../corrections";
import {
  contentTokens,
  matchCorrectionsToClaims,
  overlap,
  sameSpeaker,
  scorePair,
} from "../corrections-match";
import type { LedgerClaim } from "../types";

function claim(overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  return {
    id: "claim-1",
    speaker: { memberId: 172, name: "David Lammy", party: "Lab", constituency: "Tottenham" },
    verbatimQuote: "17 prisoners a month were released in error in 2024",
    normalizedClaim: "Seventeen prisoners per month were released in error during 2024.",
    claimType: "retrodictable",
    topic: "statistics",
    resolutionDue: null,
    sourceUrl: "https://hansard.parliament.uk/x#contribution-A",
    contributionExternalId: "A",
    utteredAt: "2025-11-11",
    context: "pmqs",
    extractedBy: { provider: "test", model: "m", version: "v" },
    occurrences: 1,
    ...overrides,
  };
}

function correction(overrides: Partial<MinisterialCorrection> = {}): MinisterialCorrection {
  return {
    id: "poo:X",
    kind: "oral-point-of-order",
    house: "Commons",
    correctedOn: "2025-11-11",
    member: { memberId: 172, name: "Mr Lammy", party: null, role: null },
    department: null,
    heading: "Prisoner Releases in Error",
    originalDate: "2025-11-11",
    originalUrl: null,
    originalRef: null,
    originalText: null,
    correctedText:
      "I think I said that 17 prisoners a month were released in error in 2024. The figure was for releases in error per month across the year.",
    correctionUrl: "https://hansard.parliament.uk/y",
    daysToCorrect: 0,
    needsReview: true,
    alsoLaidIn: null,
    ...overrides,
  };
}

describe("tokenising", () => {
  it("keeps figures and drops stopwords", () => {
    const t = contentTokens("The Minister said £4.2bn was spent on 1,200 nurses");
    expect(t.has("4.2bn")).toBe(true);
    expect(t.has("1200")).toBe(true);
    expect(t.has("nurses")).toBe(true);
    expect(t.has("the")).toBe(false);
    expect(t.has("minister")).toBe(false);
  });

  it("overlap is symmetric and bounded", () => {
    const a = contentTokens("prisoners released in error");
    const b = contentTokens("prisoners released in error last year by mistake");
    expect(overlap(a, b)).toBe(1);
    expect(overlap(b, a)).toBe(1);
    expect(overlap(a, new Set())).toBe(0);
  });
});

describe("speaker gate", () => {
  it("matches on member id when both have one", () => {
    expect(sameSpeaker(correction(), claim())).toBe(true);
    expect(sameSpeaker(correction({ member: { memberId: 9, name: "David Lammy", party: null, role: null } }), claim())).toBe(false);
  });

  it("falls back to a normalised name without ids", () => {
    const c = correction({ member: { memberId: null, name: "Rt Hon David Lammy MP", party: null, role: null } });
    expect(sameSpeaker(c, claim())).toBe(true);
  });
});

describe("scoring", () => {
  it("high confidence: same speaker, same date, strong wording + shared figure", () => {
    const m = scorePair(correction(), claim())!;
    expect(m.confidence).toBe("high");
    expect(m.score).toBeGreaterThanOrEqual(0.7);
    expect(m.needsReview).toBe(true);
    expect(m.reasons.join(" ")).toMatch(/same speaker/);
    expect(m.reasons.join(" ")).toMatch(/shared figure/);
  });

  it("low confidence when the date is off but the wording matches", () => {
    const m = scorePair(correction({ originalDate: "2025-11-09" }), claim())!;
    expect(m).not.toBeNull();
    expect(m.confidence).toBe("low");
  });

  it("no match for a different speaker, however similar the text", () => {
    expect(scorePair(correction(), claim({ speaker: { memberId: 1, name: "Other", party: null, constituency: null } }))).toBeNull();
  });

  it("no match when the correction predates the claim", () => {
    expect(scorePair(correction({ correctedOn: "2025-11-01", originalDate: "2025-10-30" }), claim())).toBeNull();
  });

  it("no match on same speaker + unrelated topic + distant date", () => {
    const c = correction({
      originalDate: "2025-06-01",
      heading: "Gaelic broadcasting",
      correctedText: "MG ALBA budget per Gaelic speaker compared with S4C.",
    });
    expect(scorePair(c, claim())).toBeNull();
  });

  it("returns at most three proposals per correction, best first", () => {
    const claims = [1, 2, 3, 4, 5].map((i) => claim({ id: `c${i}` }));
    const out = matchCorrectionsToClaims([correction()], claims);
    expect(out).toHaveLength(3);
    expect(out[0].score).toBeGreaterThanOrEqual(out[2].score);
  });
});
