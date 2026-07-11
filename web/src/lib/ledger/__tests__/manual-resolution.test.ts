import { describe, expect, it } from "vitest";
import {
  manualResolutionId,
  validateManualResolution,
  MANUAL_RESOLVER_VERSION,
} from "../../db/ledger-resolutions";
import type { LedgerEvidence } from "../types";

const CLAIM_ID = "a".repeat(32);

function makeEvidence(overrides: Partial<LedgerEvidence> = {}): LedgerEvidence {
  return {
    url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2026/",
    excerpt: "OBR outturn table 2.1 shows spending rose in every year of the period.",
    kind: "obr",
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<Parameters<typeof validateManualResolution>[0]> = {},
) {
  return {
    claimId: CLAIM_ID,
    verdict: "false",
    evidence: [makeEvidence()],
    reasoning:
      "The OBR outturn table contradicts the stated figure for every year in the period.",
    proposedBy: "human:0xabc",
    ...overrides,
  };
}

describe("manualResolutionId", () => {
  it("is deterministic per claim + evidence urls + version", () => {
    expect(manualResolutionId(CLAIM_ID, ["https://a", "https://b"])).toBe(
      manualResolutionId(CLAIM_ID, ["https://a", "https://b"]),
    );
    expect(manualResolutionId(CLAIM_ID, ["https://a"])).not.toBe(
      manualResolutionId(CLAIM_ID, ["https://b"]),
    );
    expect(manualResolutionId(CLAIM_ID, ["https://a"])).not.toBe(
      manualResolutionId("b".repeat(32), ["https://a"]),
    );
    expect(MANUAL_RESOLVER_VERSION).toBe("manual-v1");
  });

  it("is insensitive to evidence url order", () => {
    expect(manualResolutionId(CLAIM_ID, ["https://b", "https://a"])).toBe(
      manualResolutionId(CLAIM_ID, ["https://a", "https://b"]),
    );
  });

  it("produces 32 hex chars, including for empty evidence", () => {
    expect(manualResolutionId(CLAIM_ID, ["https://a"])).toMatch(/^[0-9a-f]{32}$/);
    expect(manualResolutionId(CLAIM_ID, [])).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("validateManualResolution", () => {
  it("accepts a valid proposal and assembles the row", () => {
    const params = makeParams();
    const resolution = validateManualResolution(params);
    expect(resolution).not.toBeNull();
    expect(resolution!.id).toBe(
      manualResolutionId(CLAIM_ID, [params.evidence[0].url]),
    );
    expect(resolution!.claimId).toBe(CLAIM_ID);
    expect(resolution!.verdict).toBe("false");
    expect(resolution!.evidence).toHaveLength(1);
    expect(resolution!.resolvedBy).toBe("human:0xabc");
    expect(resolution!.status).toBe("proposed");
    expect(resolution!.reviewedBy).toBeNull();
  });

  it("voids non-unresolved verdicts with no evidence", () => {
    expect(validateManualResolution(makeParams({ evidence: [] }))).toBeNull();
    expect(
      validateManualResolution(makeParams({ verdict: "true", evidence: [] })),
    ).toBeNull();
  });

  it("allows unresolved with no evidence", () => {
    const resolution = validateManualResolution(
      makeParams({ verdict: "unresolved", evidence: [] }),
    );
    expect(resolution).not.toBeNull();
    expect(resolution!.verdict).toBe("unresolved");
  });

  it("rejects verdicts outside the fixed vocabulary", () => {
    expect(
      validateManualResolution(makeParams({ verdict: "mostly-true" })),
    ).toBeNull();
    expect(validateManualResolution(makeParams({ verdict: "lie" }))).toBeNull();
  });

  it("rejects evidence with a kind outside the vocabulary", () => {
    expect(
      validateManualResolution(
        makeParams({
          evidence: [makeEvidence({ kind: "blog" as LedgerEvidence["kind"] })],
        }),
      ),
    ).toBeNull();
  });

  it("rejects non-https urls and out-of-bounds excerpts", () => {
    expect(
      validateManualResolution(
        makeParams({ evidence: [makeEvidence({ url: "http://obr.uk/x" })] }),
      ),
    ).toBeNull();
    expect(
      validateManualResolution(
        makeParams({ evidence: [makeEvidence({ excerpt: "too short" })] }),
      ),
    ).toBeNull();
    expect(
      validateManualResolution(
        makeParams({ evidence: [makeEvidence({ excerpt: "x".repeat(601) })] }),
      ),
    ).toBeNull();
  });

  it("rejects out-of-bounds reasoning", () => {
    expect(
      validateManualResolution(makeParams({ reasoning: "short" })),
    ).toBeNull();
    expect(
      validateManualResolution(makeParams({ reasoning: "x".repeat(1201) })),
    ).toBeNull();
  });

  it("requires a human proposer identity", () => {
    expect(
      validateManualResolution(makeParams({ proposedBy: "agent:test/m@v1" })),
    ).toBeNull();
  });
});
