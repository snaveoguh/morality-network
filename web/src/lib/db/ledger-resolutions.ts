// ledger_resolutions repo — Phase B review queue + published verdicts.
// Schema: web/migrations/003_claim_resolutions.sql. The human review gate is
// enforced both here and by the DB CHECK constraint: publishing a 'false' or
// 'partial' verdict without a reviewer is impossible at either layer.

import { createHash } from "node:crypto";
import { sql } from "../db";
import { isoDateOnly } from "./ledger-claims";
import type {
  LedgerEvidence,
  LedgerResolution,
  LedgerVerdict,
} from "../ledger/types";

interface ResolutionRow {
  id: string;
  claim_id: string;
  verdict: LedgerVerdict;
  evidence: LedgerEvidence[];
  reasoning: string;
  resolved_by: string;
  reviewed_by: string | null;
  status: LedgerResolution["status"];
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function rowToResolution(row: ResolutionRow): LedgerResolution {
  return {
    id: row.id,
    claimId: row.claim_id,
    verdict: row.verdict,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    reasoning: row.reasoning,
    resolvedBy: row.resolved_by,
    reviewedBy: row.reviewed_by,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: new Date(row.created_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  };
}

/** Queue a proposal. No-op if the claim already has a live resolution. */
export async function recordProposal(r: LedgerResolution): Promise<boolean> {
  const rows = await sql`
    INSERT INTO pooter.ledger_resolutions (
      id, claim_id, verdict, evidence, reasoning, resolved_by, status
    ) VALUES (
      ${r.id}, ${r.claimId}, ${r.verdict},
      ${sql.json(r.evidence as unknown as Parameters<typeof sql.json>[0])},
      ${r.reasoning}, ${r.resolvedBy}, ${"proposed"}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

// ── Human-proposed resolutions ──────────────────────────────────────────────
// The resolution agent only covers voting-record and statistics; operators
// propose verdicts for everything else (policy-outcome, spending) from the
// review UI. A manual proposal is still a proposal — it enters the same
// queue and publishes only through approveResolution.

export const MANUAL_RESOLVER_VERSION = "manual-v1";

const VALID_VERDICTS = new Set<LedgerVerdict>([
  "true",
  "false",
  "partial",
  "unresolved",
]);

const EVIDENCE_KINDS = new Set<LedgerEvidence["kind"]>([
  "division",
  "ons",
  "hansard",
  "obr",
  "other",
]);

/** Deterministic id — mirrors resolve.ts's resolutionId shape. */
export function manualResolutionId(
  claimId: string,
  evidenceUrls: string[],
): string {
  return createHash("sha256")
    .update(
      `${claimId}\n${[...evidenceUrls].sort().join(",") || "none"}\n${MANUAL_RESOLVER_VERSION}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Validate a human proposal and assemble the resolution row. Pure — returns
 * null when the verdict is outside the fixed vocabulary, the reasoning is
 * out of bounds, an evidence entry is malformed, or a non-'unresolved'
 * verdict carries no evidence (the document-chain rule, same as the DB
 * constraint enforces at publication).
 */
export function validateManualResolution(params: {
  claimId: string;
  verdict: string;
  evidence: LedgerEvidence[];
  reasoning: string;
  proposedBy: string;
}): LedgerResolution | null {
  const { claimId, evidence, proposedBy } = params;

  if (!VALID_VERDICTS.has(params.verdict as LedgerVerdict)) return null;
  const verdict = params.verdict as LedgerVerdict;

  if (!proposedBy.startsWith("human:")) return null;

  const reasoning = params.reasoning.trim();
  if (reasoning.length < 20 || reasoning.length > 1200) return null;

  if (!Array.isArray(evidence) || evidence.length > 10) return null;
  for (const entry of evidence) {
    if (
      !/^https:\/\//.test(entry.url) ||
      entry.excerpt.trim().length < 10 ||
      entry.excerpt.trim().length > 600 ||
      !EVIDENCE_KINDS.has(entry.kind)
    ) {
      return null;
    }
  }

  // Every verdict except 'unresolved' needs a document chain.
  if (verdict !== "unresolved" && evidence.length === 0) return null;

  return {
    id: manualResolutionId(claimId, evidence.map((e) => e.url)),
    claimId,
    verdict,
    evidence,
    reasoning,
    resolvedBy: proposedBy,
    reviewedBy: null,
    status: "proposed",
    reviewNote: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };
}

/**
 * Queue a human proposal. Returns the resolution id, or null when the params
 * fail validation, the claim does not exist, or the claim already has a live
 * resolution (the partial unique index makes repeats no-ops).
 */
export async function createManualResolution(params: {
  claimId: string;
  verdict: string;
  evidence: LedgerEvidence[];
  reasoning: string;
  proposedBy: string;
}): Promise<string | null> {
  const r = validateManualResolution(params);
  if (!r) return null;
  // Same claim-must-exist guard as createDispute.
  const rows = await sql`
    INSERT INTO pooter.ledger_resolutions (
      id, claim_id, verdict, evidence, reasoning, resolved_by, status
    )
    SELECT ${r.id}, ${r.claimId}, ${r.verdict},
           ${sql.json(r.evidence as unknown as Parameters<typeof sql.json>[0])},
           ${r.reasoning}, ${r.resolvedBy}, ${"proposed"}
    WHERE EXISTS (SELECT 1 FROM pooter.ledger_claims WHERE id = ${r.claimId})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows.length > 0 ? r.id : null;
}

/** Claim ids that already have a live (non-rejected) resolution. */
export async function claimIdsWithLiveResolution(
  claimIds: string[],
): Promise<Set<string>> {
  if (claimIds.length === 0) return new Set();
  const rows = await sql<Array<{ claim_id: string }>>`
    SELECT claim_id FROM pooter.ledger_resolutions
    WHERE claim_id IN ${sql(claimIds)} AND status <> 'rejected'
  `;
  return new Set(rows.map((r) => r.claim_id));
}

export interface ReviewQueueItem {
  resolution: LedgerResolution;
  claim: {
    id: string;
    speakerName: string;
    party: string | null;
    verbatimQuote: string;
    normalizedClaim: string;
    sourceUrl: string;
    utteredAt: string;
    topic: string;
  };
}

/** Proposals awaiting human review, oldest first, with their claims. */
export async function listReviewQueue(limit = 50): Promise<ReviewQueueItem[]> {
  const rows = await sql<
    Array<
      ResolutionRow & {
        speaker_name: string;
        party: string | null;
        verbatim_quote: string;
        normalized_claim: string;
        source_url: string;
        uttered_at: string;
        topic: string;
      }
    >
  >`
    SELECT r.*, c.speaker_name, c.party, c.verbatim_quote, c.normalized_claim,
           c.source_url, c.uttered_at, c.topic
    FROM pooter.ledger_resolutions r
    JOIN pooter.ledger_claims c ON c.id = r.claim_id
    WHERE r.status = 'proposed'
    ORDER BY r.created_at ASC
    LIMIT ${Math.max(1, Math.min(200, limit))}
  `;
  return rows.map((row) => ({
    resolution: rowToResolution(row),
    claim: {
      id: row.claim_id,
      speakerName: row.speaker_name,
      party: row.party,
      verbatimQuote: row.verbatim_quote,
      normalizedClaim: row.normalized_claim,
      sourceUrl: row.source_url,
      utteredAt: isoDateOnly(row.uttered_at),
      topic: row.topic,
    },
  }));
}

/**
 * Approve a proposal: records the reviewer and publishes.
 * Every approval carries a reviewer identity, which also satisfies the DB
 * constraint for negative verdicts.
 */
export async function approveResolution(
  resolutionId: string,
  reviewedBy: string,
  note?: string,
  extraEvidence?: LedgerEvidence[],
): Promise<boolean> {
  if (!reviewedBy.startsWith("human:")) {
    throw new Error("approveResolution requires a human reviewer identity");
  }
  // Reviewer-curated evidence (OBR evaluation reports, court judgments,
  // inquiries) appends to the agent's chain — it never replaces it.
  const extra =
    extraEvidence && extraEvidence.length > 0
      ? sql`evidence = evidence || ${sql.json(extraEvidence as unknown as Parameters<typeof sql.json>[0])},`
      : sql``;
  const rows = await sql`
    UPDATE pooter.ledger_resolutions
    SET ${extra} status = 'published', reviewed_by = ${reviewedBy},
        review_note = ${note ?? null}, reviewed_at = NOW()
    WHERE id = ${resolutionId} AND status = 'proposed'
    RETURNING id, claim_id
  `;
  if (rows.length === 0) return false;
  await sql`
    UPDATE pooter.ledger_claims SET status = 'resolved'
    WHERE id = ${String(rows[0].claim_id)}
  `;
  return true;
}

/** Reject a proposal; the claim stays unresolved and can be re-proposed. */
export async function rejectResolution(
  resolutionId: string,
  reviewedBy: string,
  note?: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE pooter.ledger_resolutions
    SET status = 'rejected', reviewed_by = ${reviewedBy},
        review_note = ${note ?? null}, reviewed_at = NOW()
    WHERE id = ${resolutionId} AND status = 'proposed'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Published verdicts for a set of claims (for the public /ledger page). */
export async function publishedResolutionsForClaims(
  claimIds: string[],
): Promise<Map<string, LedgerResolution>> {
  if (claimIds.length === 0) return new Map();
  const rows = await sql<ResolutionRow[]>`
    SELECT * FROM pooter.ledger_resolutions
    WHERE claim_id IN ${sql(claimIds)} AND status = 'published'
  `;
  return new Map(rows.map((row) => [row.claim_id, rowToResolution(row)]));
}
