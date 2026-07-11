// Golden-set benchmark for the live extraction agent.
//
// Runs the REAL provider chain (Agent Hub → configured providers), so it is
// opt-in and needs credentials:
//
//   RUN_LEDGER_BENCHMARK=1 npx vitest run src/lib/ledger/__tests__/benchmark.test.ts
//
// Reports precision (extracted claims that were expected) and recall
// (expected claims that were found), plus the two hard invariants that must
// never fail regardless of model: every quote is verbatim, and negative
// cases produce nothing. Track results per model — extraction quality > cost
// (spec §Risks); this benchmark is how model choice gets decided.

import { describe, expect, it } from "vitest";
import { extractClaimsFromDebate, findVerbatimQuote } from "../extract";
import type { HansardDebate } from "../types";
import { GOLDEN_CASES, GOLDEN_DEBATE_DATE } from "./golden-set";

const enabled = process.env.RUN_LEDGER_BENCHMARK === "1";

describe.runIf(enabled)("ledger extraction benchmark (live model)", () => {
  it(
    "meets precision/recall floors on the golden set",
    { timeout: 300_000 },
    async () => {
      const debate: HansardDebate = {
        extId: "GOLDEN-BENCH",
        title: "Engagements",
        house: "Commons",
        date: GOLDEN_DEBATE_DATE,
        sourceUrl: "https://hansard.parliament.uk/golden",
        contributions: GOLDEN_CASES.map((c) => c.contribution),
      };

      const { claims } = await extractClaimsFromDebate(debate);

      // Invariant 1: every published quote is verbatim from its source.
      for (const claim of claims) {
        const source = GOLDEN_CASES.find(
          (c) => c.contribution.externalId === claim.contributionExternalId,
        );
        expect(source, `unknown contribution for claim ${claim.id}`).toBeDefined();
        expect(
          findVerbatimQuote(source!.contribution.text, claim.verbatimQuote),
          `non-verbatim quote survived validation: "${claim.verbatimQuote}"`,
        ).not.toBeNull();
      }

      // Invariant 2: negative cases yield nothing checkable.
      for (const goldenCase of GOLDEN_CASES.filter((c) => c.expected.length === 0)) {
        const leaked = claims.filter(
          (claim) =>
            claim.contributionExternalId === goldenCase.contribution.externalId &&
            claim.claimType !== "unfalsifiable",
        );
        expect(
          leaked,
          `checkable claims extracted from rhetoric-only contribution:\n${leaked
            .map((c) => `  "${c.verbatimQuote}"`)
            .join("\n")}`,
        ).toHaveLength(0);
      }

      // Precision / recall on labeled fragments.
      const expectedAll = GOLDEN_CASES.flatMap((c) =>
        c.expected.map((e) => ({ ...e, externalId: c.contribution.externalId })),
      );
      const found = expectedAll.filter((e) =>
        claims.some(
          (claim) =>
            claim.contributionExternalId === e.externalId &&
            claim.verbatimQuote.toLowerCase().includes(e.mustContain.toLowerCase()),
        ),
      );
      const matchedClaims = claims.filter((claim) =>
        expectedAll.some(
          (e) =>
            claim.contributionExternalId === e.externalId &&
            claim.verbatimQuote.toLowerCase().includes(e.mustContain.toLowerCase()),
        ),
      );

      const recall = expectedAll.length ? found.length / expectedAll.length : 1;
      const precision = claims.length ? matchedClaims.length / claims.length : 1;
      const typeAgreement = found.filter((e) =>
        claims.some(
          (claim) =>
            claim.contributionExternalId === e.externalId &&
            claim.verbatimQuote.toLowerCase().includes(e.mustContain.toLowerCase()) &&
            claim.claimType === e.claimType,
        ),
      ).length;

      const stamp = claims[0]?.extractedBy;
      console.log(
        [
          "",
          "=== ledger extraction benchmark ===",
          `model:      ${stamp ? `${stamp.provider}/${stamp.model}` : "n/a"} (${stamp?.version ?? "n/a"})`,
          `claims:     ${claims.length} extracted`,
          `recall:     ${found.length}/${expectedAll.length} expected found (${(recall * 100).toFixed(0)}%)`,
          `precision:  ${matchedClaims.length}/${claims.length} extracted were expected (${(precision * 100).toFixed(0)}%)`,
          `type match: ${typeAgreement}/${found.length} found claims typed as labeled`,
          "missed:     " +
            (expectedAll
              .filter((e) => !found.includes(e))
              .map((e) => `"${e.mustContain}"`)
              .join(", ") || "none"),
          "===================================",
        ].join("\n"),
      );

      // Floors, not targets — low enough to be model-agnostic, high enough
      // to catch a broken prompt or validator. Ratchet up as models improve.
      expect(recall).toBeGreaterThanOrEqual(0.5);
      expect(precision).toBeGreaterThanOrEqual(0.4);
    },
  );
});

// Keep vitest happy when the suite is skipped.
describe.runIf(!enabled)("ledger extraction benchmark", () => {
  it("is skipped (set RUN_LEDGER_BENCHMARK=1 to run against a live model)", () => {
    expect(enabled).toBe(false);
  });
});
