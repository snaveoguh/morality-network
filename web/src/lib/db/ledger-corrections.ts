// ministerial_corrections repo — corrections register (prototype).
// Writers: scripts/backfill-corrections.ts. Readers: /ledger/corrections.
// Schema: web/migrations/013_ministerial_corrections.sql.

import { sql } from "../db";
import { isoDateOnly, rowToClaim, type LedgerClaimRow } from "./ledger-claims";
import type { MinisterialCorrection } from "../ledger/corrections";
import type { CorrectionClaimMatch } from "../ledger/corrections-match";
import type { LedgerClaim, LedgerResolution } from "../ledger/types";

interface CorrectionRow {
  id: string;
  kind: MinisterialCorrection["kind"];
  house: string;
  corrected_on: unknown;
  member_id: number | null;
  member_name: string;
  party: string | null;
  member_role: string | null;
  department: string | null;
  heading: string;
  original_date: unknown;
  original_url: string | null;
  original_ref: string | null;
  original_text: string | null;
  corrected_text: string;
  correction_url: string;
  days_to_correct: number | null;
  needs_review: boolean;
  also_laid_in: string | null;
}

function rowToCorrection(row: CorrectionRow): MinisterialCorrection {
  return {
    id: row.id,
    kind: row.kind,
    house: row.house === "Lords" ? "Lords" : "Commons",
    correctedOn: isoDateOnly(row.corrected_on),
    member: {
      memberId: row.member_id,
      name: row.member_name,
      party: row.party,
      role: row.member_role,
    },
    department: row.department,
    heading: row.heading,
    originalDate: row.original_date ? isoDateOnly(row.original_date) : null,
    originalUrl: row.original_url,
    originalRef: row.original_ref,
    originalText: row.original_text,
    correctedText: row.corrected_text,
    correctionUrl: row.correction_url,
    daysToCorrect: row.days_to_correct,
    needsReview: row.needs_review,
    alsoLaidIn: row.also_laid_in === "Lords" || row.also_laid_in === "Commons" ? row.also_laid_in : null,
  };
}

/** Idempotent upsert — the official record can be re-fetched any time. */
export async function upsertCorrections(rows: MinisterialCorrection[]): Promise<number> {
  for (const c of rows) {
    await sql`
      INSERT INTO pooter.ministerial_corrections (
        id, kind, house, corrected_on, member_id, member_name, party, member_role,
        department, heading, original_date, original_url, original_ref,
        original_text, corrected_text, correction_url, days_to_correct,
        needs_review, also_laid_in
      ) VALUES (
        ${c.id}, ${c.kind}, ${c.house}, ${c.correctedOn}, ${c.member.memberId},
        ${c.member.name}, ${c.member.party}, ${c.member.role}, ${c.department},
        ${c.heading}, ${c.originalDate}, ${c.originalUrl}, ${c.originalRef},
        ${c.originalText}, ${c.correctedText}, ${c.correctionUrl},
        ${c.daysToCorrect}, ${c.needsReview}, ${c.alsoLaidIn}
      )
      ON CONFLICT (id) DO UPDATE SET
        original_date = EXCLUDED.original_date,
        original_url = EXCLUDED.original_url,
        original_text = EXCLUDED.original_text,
        corrected_text = EXCLUDED.corrected_text,
        days_to_correct = EXCLUDED.days_to_correct,
        also_laid_in = EXCLUDED.also_laid_in,
        fetched_at = NOW()
    `;
  }
  return rows.length;
}

export async function listCorrections(limit = 2000): Promise<MinisterialCorrection[]> {
  const rows = await sql<CorrectionRow[]>`
    SELECT * FROM pooter.ministerial_corrections
    ORDER BY corrected_on DESC, id ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
  return rows.map(rowToCorrection);
}

/** Ledger claims by any of the given speakers — the matcher's candidate pool. */
export async function listClaimsForMembers(memberIds: number[]): Promise<LedgerClaim[]> {
  if (memberIds.length === 0) return [];
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, context, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE member_id IN ${sql(memberIds)}
    ORDER BY uttered_at DESC
    LIMIT 5000
  `;
  return rows.map(rowToClaim);
}

/** Store match proposals; never overwrites a human's confirm/reject. */
export async function recordMatchProposals(matches: CorrectionClaimMatch[]): Promise<void> {
  for (const m of matches) {
    await sql`
      INSERT INTO pooter.correction_claim_matches
        (correction_id, claim_id, score, confidence, reasons, matcher_version)
      VALUES (${m.correctionId}, ${m.claimId}, ${m.score}, ${m.confidence},
              ${sql.json(m.reasons)}, ${m.matcherVersion})
      ON CONFLICT (correction_id, claim_id) DO UPDATE SET
        score = EXCLUDED.score,
        confidence = EXCLUDED.confidence,
        reasons = EXCLUDED.reasons,
        matcher_version = EXCLUDED.matcher_version
      WHERE pooter.correction_claim_matches.status = 'proposed'
    `;
  }
}

export interface InaccurateClaim {
  claim: LedgerClaim;
  verdict: Extract<LedgerResolution["verdict"], "false" | "partial">;
  reviewedBy: string;
  reviewedAt: string | null;
}

/**
 * Claims a HUMAN has marked inaccurate: published false/partial verdicts with
 * a reviewer (the DB CHECK in migration 003 makes reviewer mandatory for
 * these). This is the only source for the "corrections owed" list.
 */
export async function listHumanMarkedInaccurateClaims(limit = 500): Promise<InaccurateClaim[]> {
  const rows = await sql<
    Array<LedgerClaimRow & { verdict: "false" | "partial"; reviewed_by: string; reviewed_at: string | null }>
  >`
    SELECT c.id, c.member_id, c.speaker_name, c.party, c.constituency,
           c.verbatim_quote, c.normalized_claim, c.claim_type, c.topic,
           c.resolution_due, c.source_url, c.contribution_ext_id, c.uttered_at,
           c.context, c.extracted_by, c.occurrences,
           r.verdict, r.reviewed_by, r.reviewed_at
    FROM pooter.ledger_resolutions r
    JOIN pooter.ledger_claims c ON c.id = r.claim_id
    WHERE r.status = 'published'
      AND r.verdict IN ('false', 'partial')
      AND r.reviewed_by IS NOT NULL
    ORDER BY c.uttered_at ASC
    LIMIT ${Math.max(1, Math.min(2000, limit))}
  `;
  return rows.map((row) => ({
    claim: rowToClaim(row),
    verdict: row.verdict,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  }));
}
