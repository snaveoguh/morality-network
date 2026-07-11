import { describe, expect, it } from "vitest";
import {
  parseResolutionResponse,
  proposeResolution,
  resolutionId,
  validateProposal,
  RESOLVER_VERSION,
  type RawResolutionProposal,
  type ResolverGenerate,
} from "../resolve";
import type { LedgerClaim, LedgerEvidence } from "../types";

function makeClaim(overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  return {
    id: "claim-1",
    speaker: { memberId: 42, name: "Test Member", party: "Con", constituency: null },
    verbatimQuote: "not one Labour MP voted to support the policy last night",
    normalizedClaim: "No Labour MPs voted in favour of the policy in last night's division.",
    claimType: "retrodictable",
    topic: "voting-record",
    resolutionDue: null,
    sourceUrl: "https://hansard.parliament.uk/x#contribution-A",
    contributionExternalId: "A",
    utteredAt: "2026-07-08",
    context: "pmqs",
    extractedBy: { provider: "test", model: "m", version: "v" },
    occurrences: 1,
    ...overrides,
  };
}

const CANDIDATES = new Map<string, LedgerEvidence>([
  [
    "2403",
    {
      url: "https://votes.parliament.uk/votes/commons/division/2403",
      excerpt: 'Division 2403 (2026-07-07): "Sentencing Bill" — Ayes 283, Noes 182.',
      kind: "division",
    },
  ],
]);

function makeRaw(overrides: Partial<RawResolutionProposal> = {}): RawResolutionProposal {
  return {
    verdict: "false",
    cited_records: ["2403"],
    basis:
      "The division record shows 283 Members voted Aye, so the claim that none supported it is contradicted.",
    confidence: 0.9,
    ...overrides,
  };
}

describe("parseResolutionResponse", () => {
  it("parses a JSON object with surrounding prose", () => {
    const raw = parseResolutionResponse(`Verdict:\n${JSON.stringify(makeRaw())}\n`);
    expect(raw?.verdict).toBe("false");
  });

  it("rejects malformed shapes", () => {
    expect(parseResolutionResponse("[]")).toBeNull();
    expect(parseResolutionResponse('{"verdict": "false"}')).toBeNull();
    expect(parseResolutionResponse("nope")).toBeNull();
  });
});

describe("validateProposal", () => {
  const base = {
    claim: makeClaim(),
    candidateEvidence: CANDIDATES,
    resolvedBy: "agent:test/m@resolve-v1",
  };

  it("accepts a valid proposal and assembles evidence server-side", () => {
    const resolution = validateProposal({ ...base, raw: makeRaw() });
    expect(resolution).not.toBeNull();
    expect(resolution!.status).toBe("proposed");
    expect(resolution!.reviewedBy).toBeNull();
    expect(resolution!.evidence).toHaveLength(1);
    expect(resolution!.evidence[0].url).toContain("votes.parliament.uk");
  });

  it("voids proposals citing records outside the candidate set", () => {
    const resolution = validateProposal({
      ...base,
      raw: makeRaw({ cited_records: ["9999"] }),
    });
    expect(resolution).toBeNull();
  });

  it("voids non-unresolved verdicts with no evidence", () => {
    const resolution = validateProposal({
      ...base,
      raw: makeRaw({ cited_records: [] }),
    });
    expect(resolution).toBeNull();
  });

  it("allows unresolved with no evidence", () => {
    const resolution = validateProposal({
      ...base,
      raw: makeRaw({ verdict: "unresolved", cited_records: [] }),
    });
    expect(resolution).not.toBeNull();
    expect(resolution!.verdict).toBe("unresolved");
  });

  it("drops under-confident proposals", () => {
    expect(
      validateProposal({ ...base, raw: makeRaw({ confidence: 0.4 }) }),
    ).toBeNull();
  });

  it("rejects verdicts outside the fixed vocabulary", () => {
    expect(
      validateProposal({ ...base, raw: makeRaw({ verdict: "mostly-true" }) }),
    ).toBeNull();
    expect(
      validateProposal({ ...base, raw: makeRaw({ verdict: "lie" }) }),
    ).toBeNull();
  });
});

describe("resolutionId", () => {
  it("is deterministic per claim + citation set + version", () => {
    expect(resolutionId("c1", "2403")).toBe(resolutionId("c1", "2403"));
    expect(resolutionId("c1", "2403")).not.toBe(resolutionId("c1", "2404"));
    expect(RESOLVER_VERSION).toContain("resolve");
  });
});

describe("proposeResolution", () => {
  it("skips claims outside resolvable topics without calling the model", async () => {
    let called = false;
    const generate: ResolverGenerate = async () => {
      called = true;
      return { text: "{}", provider: "mock", model: "m" };
    };
    const result = await proposeResolution(
      makeClaim({ topic: "policy-outcome" }),
      { generate },
    );
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("skips predictive claims", async () => {
    const result = await proposeResolution(
      makeClaim({ claimType: "predictive" }),
      { generate: async () => ({ text: "{}", provider: "mock", model: "m" }) },
    );
    expect(result).toBeNull();
  });
});

describe("isoDateOnly (postgres DATE handling)", () => {
  it("normalizes JS Date objects and ISO strings to YYYY-MM-DD", async () => {
    const { isoDateOnly } = await import("../../db/ledger-claims");
    expect(isoDateOnly(new Date("2026-07-08T00:00:00Z"))).toBe("2026-07-08");
    expect(isoDateOnly("2026-07-08T00:00:00")).toBe("2026-07-08");
    expect(isoDateOnly("2026-07-08")).toBe("2026-07-08");
  });
});
