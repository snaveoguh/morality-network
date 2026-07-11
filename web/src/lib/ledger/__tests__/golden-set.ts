// Claim Ledger — golden set for the extraction benchmark.
//
// Real contributions from PMQs, Commons, 8 July 2026 ("Engagements",
// debate 5C312200-26FA-43B6-A45A-1D46829257FA), hand-labeled. Text is
// verbatim from the Hansard API after markup stripping.
//
// Labels are deliberately loose: an expected claim matches if its
// `mustContain` fragment appears inside any extracted verbatim quote for the
// contribution, so the benchmark measures claim discovery rather than exact
// quote-boundary choices. Negative cases have an empty `expected` array.

import type { HansardContribution, LedgerClaimType } from "../types";

export interface GoldenExpectedClaim {
  /** Distinctive fragment that must appear in an extracted verbatim quote. */
  mustContain: string;
  claimType: LedgerClaimType;
}

export interface GoldenCase {
  contribution: HansardContribution;
  expected: GoldenExpectedClaim[];
}

const DEBATE_URL =
  "https://hansard.parliament.uk/Commons/2026-07-08/debates/5C312200-26FA-43B6-A45A-1D46829257FA/Engagements";

function contribution(
  externalId: string,
  name: string,
  party: string | null,
  order: number,
  text: string,
): HansardContribution {
  return {
    externalId,
    speaker: { memberId: null, name, party, constituency: null },
    text,
    orderInSection: order,
    sourceUrl: `${DEBATE_URL}#contribution-${externalId}`,
  };
}

export const GOLDEN_DEBATE_DATE = "2026-07-08";

export const GOLDEN_CASES: GoldenCase[] = [
  {
    // Dense numeric exchange — the core positive case.
    contribution: contribution(
      "CC4A8249-GOLD",
      "The Deputy Prime Minister",
      null,
      1,
      "The right hon. Gentleman asks about a very serious issue, and every decision we have taken has been based on public safety and delivering justice for victims. Let us talk about the context. The last Labour Government built 28,000 prison places. We are building 14,000 by 2031, and we have already delivered 3,200. The Tories closed 23 prisons: Gloucester—closed; Shrewsbury—closed; Portsmouth—closed; Holloway—closed; Northallerton—closed.",
    ),
    expected: [
      { mustContain: "28,000 prison places", claimType: "retrodictable" },
      { mustContain: "14,000 by 2031", claimType: "predictive" },
      { mustContain: "closed 23 prisons", claimType: "retrodictable" },
    ],
  },
  {
    contribution: contribution(
      "9F547FF3-GOLD",
      "Sir James Cleverly",
      "Con",
      2,
      "The right hon. Gentleman makes a joke about the use of figures. Let me give him a figure: 50,000 prisoners released early in just two years on his watch. I am genuinely shocked that, when given the opportunity to apologise to the victims, he very publicly failed to do so.",
    ),
    expected: [
      {
        mustContain: "50,000 prisoners released early",
        claimType: "retrodictable",
      },
    ],
  },
  {
    // Voting-record claim — resolvable against divisions data in Phase B.
    contribution: contribution(
      "92CCBAFE-GOLD",
      "Sir James Cleverly",
      "Con",
      3,
      "Not only does he know it is wrong, but his party knows it is wrong—not one of the 400 Labour MPs voted to support the Government’s policy in the vote last night. They know it is wrong and the country knows it is wrong, but he insists on pursuing it anyway.",
    ),
    expected: [
      {
        mustContain: "not one of the 400 Labour MPs voted",
        claimType: "retrodictable",
      },
    ],
  },
  {
    contribution: contribution(
      "DEDBFEBC-GOLD",
      "The Deputy Prime Minister",
      null,
      4,
      "He knows that while he was Home Secretary, the Conservative Government had an early release scheme that let out 10,000 offenders—10,000. They had six schemes within a year. They left a system with just 83 empty cells. That is what the previous Justice Secretary inherited when she came into office.",
    ),
    expected: [
      { mustContain: "let out 10,000 offenders", claimType: "retrodictable" },
      { mustContain: "83 empty cells", claimType: "retrodictable" },
    ],
  },
  {
    contribution: contribution(
      "32EE03D6-GOLD",
      "The Deputy Prime Minister",
      null,
      5,
      "Let us be clear: we have more probation officers, while the Conservative Government cut probation—decimated it—because of Chris Grayling. We have invested £700 million in probation. We are rolling out the largest programme of tagging in our history.",
    ),
    expected: [
      {
        mustContain: "£700 million in probation",
        claimType: "retrodictable",
      },
    ],
  },
  {
    // Pure rhetoric — the extractor must return nothing here.
    contribution: contribution(
      "16529716-GOLD",
      "Paul Holmes",
      "Con",
      6,
      "I entirely associate myself with the Deputy Prime Minister’s opening and personal remarks. Given that the Deputy Prime Minister clearly thinks the Prime Minister has always been match fit, how does he feel now that his own MPs have given the boss the red card and brought on a left winger to get them out of the relegation zone?",
    ),
    expected: [],
  },
];
