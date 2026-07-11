import { describe, expect, it } from "vitest";
import {
  chunkContributions,
  claimId,
  dedupeClaims,
  extractClaimsFromDebate,
  findVerbatimQuote,
  parseExtractionResponse,
  validateRawClaim,
  violatesLedgerVocabulary,
  EXTRACTOR_VERSION,
  type LedgerGenerate,
  type RawExtractedClaim,
} from "../extract";
import { parseAttribution, stripHansardMarkup } from "../hansard";
import type { HansardContribution, HansardDebate, LedgerClaim } from "../types";
import { GOLDEN_CASES, GOLDEN_DEBATE_DATE } from "./golden-set";

const STAMP = { provider: "test", model: "test-model", version: EXTRACTOR_VERSION };

function makeContribution(
  text: string,
  externalId = "ABC-123",
): HansardContribution {
  return {
    externalId,
    speaker: { memberId: 1, name: "Test Member", party: "Lab", constituency: "Testville" },
    text,
    orderInSection: 1,
    sourceUrl: `https://hansard.parliament.uk/x#contribution-${externalId}`,
  };
}

function makeRaw(overrides: Partial<RawExtractedClaim>): RawExtractedClaim {
  return {
    contribution_id: "ABC-123",
    verbatim_quote: "we invested £700 million in probation",
    normalized_claim: "The Government invested £700 million in probation.",
    claim_type: "retrodictable",
    topic: "spending",
    resolution_due: null,
    ...overrides,
  };
}

describe("stripHansardMarkup", () => {
  it("strips Question/QuestionText markup and the Qn prefix", () => {
    const raw =
      '<Question HRSContentId="{94C589BC}">Q1.  <QuestionText HRSContentId="{E443936C}">If he will list his official engagements for Wednesday 8 July.</QuestionText></Question>';
    expect(stripHansardMarkup(raw)).toBe(
      "If he will list his official engagements for Wednesday 8 July.",
    );
  });

  it("decodes basic entities and collapses whitespace", () => {
    expect(stripHansardMarkup("a &amp; b\n\n  c")).toBe("a & b c");
  });
});

describe("parseAttribution", () => {
  it("parses name (constituency) (party)", () => {
    const s = parseAttribution("Paul Holmes (Hamble Valley) (Con)", 4803);
    expect(s).toEqual({
      memberId: 4803,
      name: "Paul Holmes",
      party: "Con",
      constituency: "Hamble Valley",
    });
  });

  it("parses compound party codes", () => {
    const s = parseAttribution(
      "Florence Eshalomi (Vauxhall and Camberwell Green) (Lab/Co-op)",
      1,
    );
    expect(s.party).toBe("Lab/Co-op");
    expect(s.constituency).toBe("Vauxhall and Camberwell Green");
  });

  it("resolves officeholder attributions to the person's name", () => {
    const s = parseAttribution("The Deputy Prime Minister (Mr David Lammy)", 206);
    expect(s.name).toBe("David Lammy");
    expect(s.party).toBeNull();
  });

  it("keeps bare officeholder titles", () => {
    const s = parseAttribution("The Prime Minister", 100);
    expect(s.name).toBe("The Prime Minister");
  });
});

describe("findVerbatimQuote", () => {
  const text =
    "We have invested £700 million in probation. We are rolling out the largest programme of tagging in our history.";

  it("accepts exact substrings", () => {
    expect(findVerbatimQuote(text, "invested £700 million in probation")).toBe(
      "invested £700 million in probation",
    );
  });

  it("tolerates whitespace differences only", () => {
    expect(
      findVerbatimQuote(text, "invested £700 million  in\nprobation"),
    ).toBe("invested £700 million in probation");
  });

  it("tolerates straight-vs-curly quote marks", () => {
    const curly = "He said the plan was ‘fully funded’ last year.";
    expect(findVerbatimQuote(curly, "the plan was 'fully funded'")).toBe(
      "the plan was ‘fully funded’",
    );
  });

  it("rejects paraphrases", () => {
    expect(
      findVerbatimQuote(text, "invested seven hundred million in probation"),
    ).toBeNull();
  });

  it("rejects fabricated quotes", () => {
    expect(findVerbatimQuote(text, "we cut probation funding")).toBeNull();
  });

  it("rejects trivially short quotes", () => {
    expect(findVerbatimQuote(text, "We")).toBeNull();
  });
});

describe("violatesLedgerVocabulary", () => {
  it("rejects motive vocabulary", () => {
    expect(violatesLedgerVocabulary("He lied to the House.")).toBe(true);
    expect(violatesLedgerVocabulary("The minister is lying.")).toBe(true);
    expect(violatesLedgerVocabulary("A dishonest account of spending.")).toBe(true);
    expect(
      violatesLedgerVocabulary("He deliberately misled Parliament."),
    ).toBe(true);
  });

  it("accepts neutral restatements", () => {
    expect(
      violatesLedgerVocabulary(
        "The Government released 50,000 prisoners early over two years.",
      ),
    ).toBe(false);
    // "relies" must not trip the \blies\b guard
    expect(violatesLedgerVocabulary("The claim relies on ONS data.")).toBe(false);
  });
});

describe("parseExtractionResponse", () => {
  it("parses a clean JSON array", () => {
    const parsed = parseExtractionResponse(JSON.stringify([makeRaw({})]));
    expect(parsed).toHaveLength(1);
  });

  it("extracts the array from surrounding prose", () => {
    const parsed = parseExtractionResponse(
      `Here are the claims:\n${JSON.stringify([makeRaw({})])}\nDone.`,
    );
    expect(parsed).toHaveLength(1);
  });

  it("drops malformed elements and non-arrays", () => {
    expect(parseExtractionResponse('{"not": "an array"}')).toEqual([]);
    expect(parseExtractionResponse("no json here")).toEqual([]);
    const parsed = parseExtractionResponse(
      JSON.stringify([makeRaw({}), { junk: true }]),
    );
    expect(parsed).toHaveLength(1);
  });
});

describe("validateRawClaim", () => {
  const contribution = makeContribution(
    "We have invested £700 million in probation. Waiting lists will fall by March 2027.",
  );
  const debate = { date: GOLDEN_DEBATE_DATE };

  it("accepts a valid retrodictable claim", () => {
    const claim = validateRawClaim(
      makeRaw({ verbatim_quote: "invested £700 million in probation" }),
      contribution,
      debate,
      STAMP,
    );
    expect(claim).not.toBeNull();
    expect(claim!.claimType).toBe("retrodictable");
    expect(claim!.utteredAt).toBe(GOLDEN_DEBATE_DATE);
    expect(claim!.sourceUrl).toContain("#contribution-");
  });

  it("drops fabricated quotes", () => {
    const claim = validateRawClaim(
      makeRaw({ verbatim_quote: "we abolished probation entirely" }),
      contribution,
      debate,
      STAMP,
    );
    expect(claim).toBeNull();
  });

  it("drops forbidden vocabulary in the normalized claim", () => {
    const claim = validateRawClaim(
      makeRaw({
        verbatim_quote: "invested £700 million in probation",
        normalized_claim: "The minister lied about probation spending.",
      }),
      contribution,
      debate,
      STAMP,
    );
    expect(claim).toBeNull();
  });

  it("drops unknown claim types and coerces unknown topics to other", () => {
    expect(
      validateRawClaim(makeRaw({ claim_type: "spicy" }), contribution, debate, STAMP),
    ).toBeNull();
    const claim = validateRawClaim(
      makeRaw({
        verbatim_quote: "invested £700 million in probation",
        topic: "vibes",
      }),
      contribution,
      debate,
      STAMP,
    );
    expect(claim!.topic).toBe("other");
  });

  it("keeps resolution_due only for well-formed predictive dates", () => {
    const predictive = validateRawClaim(
      makeRaw({
        verbatim_quote: "Waiting lists will fall by March 2027",
        claim_type: "predictive",
        resolution_due: "2027-03-31",
      }),
      contribution,
      debate,
      STAMP,
    );
    expect(predictive!.resolutionDue).toBe("2027-03-31");

    const retro = validateRawClaim(
      makeRaw({
        verbatim_quote: "invested £700 million in probation",
        resolution_due: "2027-03-31",
      }),
      contribution,
      debate,
      STAMP,
    );
    expect(retro!.resolutionDue).toBeNull();
  });
});

describe("dedupeClaims", () => {
  it("collapses repeats of the same proposition by the same speaker", () => {
    const contribution = makeContribution("x", "C1");
    const base = validateRawClaim(
      makeRaw({
        verbatim_quote: "invested £700 million in probation",
      }),
      makeContribution("We have invested £700 million in probation."),
      { date: GOLDEN_DEBATE_DATE },
      STAMP,
    ) as LedgerClaim;
    const repeat = { ...base, id: "other-id", contributionExternalId: contribution.externalId };
    const deduped = dedupeClaims([base, repeat]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].occurrences).toBe(2);
  });
});

describe("chunkContributions", () => {
  it("respects the character budget without splitting contributions", () => {
    const contributions = Array.from({ length: 10 }, (_, i) =>
      makeContribution("x".repeat(3000), `C-${i}`),
    );
    const chunks = chunkContributions(contributions, 7000);
    expect(chunks.flat()).toHaveLength(10);
    for (const chunk of chunks) {
      expect(chunk.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(7000);
    }
  });
});

describe("claimId", () => {
  it("is deterministic and quote-sensitive", () => {
    expect(claimId("A", "quote")).toBe(claimId("A", "quote"));
    expect(claimId("A", "quote")).not.toBe(claimId("A", "other"));
    expect(claimId("A", "quote")).toHaveLength(32);
  });
});

describe("extractClaimsFromDebate (mocked model)", () => {
  it("validates model output against sources end to end", async () => {
    const contributions = GOLDEN_CASES.map((c) => c.contribution);
    const debate: HansardDebate = {
      extId: "GOLD",
      title: "Engagements",
      house: "Commons",
      date: GOLDEN_DEBATE_DATE,
      sourceUrl: "https://hansard.parliament.uk/x",
      contributions,
    };

    // Model returns one real claim, one fabricated quote, one vocab breach.
    const generate: LedgerGenerate = async ({ user }) => {
      const claims: RawExtractedClaim[] = [];
      if (user.includes("CC4A8249-GOLD")) {
        claims.push(
          makeRaw({
            contribution_id: "CC4A8249-GOLD",
            verbatim_quote: "The last Labour Government built 28,000 prison places",
            normalized_claim:
              "The last Labour Government built 28,000 prison places.",
            topic: "policy-outcome",
          }),
          makeRaw({
            contribution_id: "CC4A8249-GOLD",
            verbatim_quote: "we built 100,000 prison places", // fabricated
          }),
          makeRaw({
            contribution_id: "CC4A8249-GOLD",
            verbatim_quote: "The Tories closed 23 prisons",
            normalized_claim: "The Conservatives lied about closing prisons.", // vocab breach
          }),
        );
      }
      return { text: JSON.stringify(claims), provider: "mock", model: "mock-1" };
    };

    const { claims } = await extractClaimsFromDebate(debate, { generate });
    expect(claims).toHaveLength(1);
    expect(claims[0].verbatimQuote).toBe(
      "The last Labour Government built 28,000 prison places",
    );
    expect(claims[0].extractedBy).toEqual({
      provider: "mock",
      model: "mock-1",
      version: EXTRACTOR_VERSION,
    });
  });
});
