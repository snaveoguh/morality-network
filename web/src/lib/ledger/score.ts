// Claim Ledger — calibration scoring (spec §Scoring).
//
// Display threshold is a hard rule: no public score until n ≥ 20 resolved
// claims. Small-n scores are cherry-picking machines and unfair in both
// directions — below threshold the UI shows progress toward one, never a
// number that looks like a track record.

import type { LedgerClaim, LedgerResolution } from "./types";

/** Resolved claims required before a calibration score displays. */
export const SCORE_DISPLAY_THRESHOLD = 20;

export interface EntityCalibration {
  nClaims: number;
  /** Claims with a published true/false/partial verdict. */
  nResolved: number;
  /** % of statements that were checkable at all — published regardless of n. */
  checkabilityRate: number;
  /** true=1, partial=0.5, false=0 over resolved claims. Null below threshold. */
  pctTrue: number | null;
  scoreVisible: boolean;
  resolvedNeeded: number;
  byTopic: Record<string, { nResolved: number; pctTrue: number }>;
}

export function computeCalibration(
  claims: LedgerClaim[],
  verdicts: Map<string, LedgerResolution>,
): EntityCalibration {
  const nClaims = claims.length;
  const checkable = claims.filter((c) => c.claimType !== "unfalsifiable");

  const resolved = claims
    .map((claim) => ({ claim, resolution: verdicts.get(claim.id) }))
    .filter(
      (
        entry,
      ): entry is { claim: LedgerClaim; resolution: LedgerResolution } =>
        entry.resolution != null &&
        entry.resolution.status === "published" &&
        entry.resolution.verdict !== "unresolved",
    );

  const credit = (verdict: LedgerResolution["verdict"]): number =>
    verdict === "true" ? 1 : verdict === "partial" ? 0.5 : 0;

  const nResolved = resolved.length;
  const scoreVisible = nResolved >= SCORE_DISPLAY_THRESHOLD;
  const pctTrue = scoreVisible
    ? Math.round(
        (resolved.reduce((sum, r) => sum + credit(r.resolution.verdict), 0) /
          nResolved) *
          1000,
      ) / 10
    : null;

  const byTopic: EntityCalibration["byTopic"] = {};
  for (const { claim, resolution } of resolved) {
    const bucket = (byTopic[claim.topic] ??= { nResolved: 0, pctTrue: 0 });
    bucket.nResolved += 1;
    bucket.pctTrue += credit(resolution.verdict);
  }
  for (const bucket of Object.values(byTopic)) {
    bucket.pctTrue = Math.round((bucket.pctTrue / bucket.nResolved) * 1000) / 10;
  }

  return {
    nClaims,
    nResolved,
    checkabilityRate:
      nClaims > 0 ? Math.round((checkable.length / nClaims) * 1000) / 10 : 0,
    pctTrue,
    scoreVisible,
    resolvedNeeded: Math.max(0, SCORE_DISPLAY_THRESHOLD - nResolved),
    byTopic,
  };
}
