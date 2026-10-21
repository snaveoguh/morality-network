// Corrections register — match corrections to ledger claims.
// Deterministic heuristics only (no model): same speaker is REQUIRED, then
// date proximity + word overlap + shared figures. Output is a PROPOSAL with
// its reasons. "high" means a reviewer will probably agree, not that the
// match is settled; every match carries a human-review flag until confirmed.
// A match never changes a claim's verdict.

import type { MinisterialCorrection } from "./corrections";
import type { LedgerClaim } from "./types";

export const MATCHER_VERSION = "corrections-match-v1";

export type MatchConfidence = "high" | "low";

export interface CorrectionClaimMatch {
  correctionId: string;
  claimId: string;
  /** 0..1, comparable within one matcher version only. */
  score: number;
  confidence: MatchConfidence;
  /** Human-readable basis, shown to the reviewer. */
  reasons: string[];
  needsReview: true;
  matcherVersion: string;
}

const STOPWORDS = new Set(
  (
    "the and for that this with have has had was were are been being from not but they them their " +
    "there what which who will would could should can into about over under than then also more most " +
    "such its our your his her she him you all any per its out off very just only some other these those " +
    "said says say stated statement answer question minister government department house hon member right " +
    "friend gentleman lady order point record correct correction inadvertently earlier today yesterday " +
    "wish like make made does did doing being because while where when whether each many much"
  ).split(" "),
);

/** Lowercased content tokens; numbers keep their digits ("£4.2bn" → "4.2bn"). */
export function contentTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[£$€,]/g, "")
    .split(/[^a-z0-9.%]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 3 || /\d/.test(t))
    .filter((t) => !STOPWORDS.has(t));
  return new Set(tokens);
}

function numericTokens(tokens: Set<string>): Set<string> {
  // Years alone are too common to count as a shared figure.
  return new Set([...tokens].filter((t) => /\d/.test(t) && !/^(19|20)\d\d$/.test(t)));
}

/** Overlap coefficient |A∩B| / min(|A|,|B|) — robust to a long vs short text. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(the|rt|hon|mr|mrs|ms|miss|dr|sir|dame|lord|baroness|mp|kc)\b\.?/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function sameSpeaker(c: MinisterialCorrection, claim: LedgerClaim): boolean {
  if (c.member.memberId && claim.speaker.memberId) {
    return c.member.memberId === claim.speaker.memberId;
  }
  const a = normName(c.member.name);
  return a.length > 0 && a === normName(claim.speaker.name);
}

function dayGap(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Score one pair; null when it fails the hard gates. */
export function scorePair(
  correction: MinisterialCorrection,
  claim: LedgerClaim,
): CorrectionClaimMatch | null {
  if (!sameSpeaker(correction, claim)) return null;
  // A correction cannot precede the claim it corrects.
  if (claim.utteredAt > correction.correctedOn) return null;

  const reasons: string[] = ["same speaker"];
  let score = 0;

  let dateExact = false;
  if (correction.originalDate) {
    const gap = dayGap(correction.originalDate, claim.utteredAt);
    if (gap === 0) {
      score += 0.45;
      dateExact = true;
      reasons.push(`claim made on the corrected statement's date (${claim.utteredAt})`);
    } else if (gap <= 3) {
      score += 0.2;
      reasons.push(`claim within ${gap} day(s) of the corrected statement`);
    } else {
      // Known, different date: only very strong text could rescue it.
      score -= 0.15;
      reasons.push(`dates differ by ${gap} days`);
    }
  }

  const claimTokens = contentTokens(`${claim.verbatimQuote} ${claim.normalizedClaim}`);
  const correctionTokens = contentTokens(
    [correction.originalText, correction.correctedText, correction.heading].filter(Boolean).join(" "),
  );
  const sim = overlap(claimTokens, correctionTokens);
  score += 0.5 * sim;
  if (sim > 0) reasons.push(`word overlap ${(sim * 100).toFixed(0)}%`);

  const sharedFigures = [...numericTokens(claimTokens)].filter((t) => numericTokens(correctionTokens).has(t));
  if (sharedFigures.length > 0) {
    score += Math.min(0.2, 0.1 * sharedFigures.length);
    reasons.push(`shared figure(s): ${sharedFigures.slice(0, 3).join(", ")}`);
  }

  score = Math.max(0, Math.min(1, score));
  if (score < 0.3) return null;

  const confidence: MatchConfidence = dateExact && sim >= 0.25 && score >= 0.7 ? "high" : "low";
  return {
    correctionId: correction.id,
    claimId: claim.id,
    score: Math.round(score * 100) / 100,
    confidence,
    reasons,
    needsReview: true,
    matcherVersion: MATCHER_VERSION,
  };
}

/** Best matches per correction (top 3), strongest first. */
export function matchCorrectionsToClaims(
  corrections: MinisterialCorrection[],
  claims: LedgerClaim[],
): CorrectionClaimMatch[] {
  const out: CorrectionClaimMatch[] = [];
  for (const correction of corrections) {
    const scored = claims
      .map((claim) => scorePair(correction, claim))
      .filter((m): m is CorrectionClaimMatch => m !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    out.push(...scored);
  }
  return out.sort((a, b) => b.score - a.score);
}
