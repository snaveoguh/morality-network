// ledger_claims repo — Claim Ledger Phase A persistence.
// Writers: PMQs ingest (cron + on-demand extraction). Readers: /ledger page,
// /api/ledger/claims. Schema: web/migrations/002_claim_ledger.sql.

import { sql } from "../db";
import type { LedgerClaim } from "../ledger/types";

interface LedgerClaimRow {
  id: string;
  member_id: number | null;
  speaker_name: string;
  party: string | null;
  constituency: string | null;
  verbatim_quote: string;
  normalized_claim: string;
  claim_type: LedgerClaim["claimType"];
  topic: LedgerClaim["topic"];
  resolution_due: string | null;
  source_url: string;
  contribution_ext_id: string;
  uttered_at: string;
  extracted_by: LedgerClaim["extractedBy"];
  occurrences: number;
}

/**
 * postgres-js returns DATE columns as JS Date objects (String() of which is
 * NOT ISO — "Thu Jul 08 2026 …"). Normalize either representation to
 * YYYY-MM-DD.
 */
export function isoDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function rowToClaim(row: LedgerClaimRow): LedgerClaim {
  return {
    id: row.id,
    speaker: {
      memberId: row.member_id,
      name: row.speaker_name,
      party: row.party,
      constituency: row.constituency,
    },
    verbatimQuote: row.verbatim_quote,
    normalizedClaim: row.normalized_claim,
    claimType: row.claim_type,
    topic: row.topic,
    resolutionDue: row.resolution_due ? isoDateOnly(row.resolution_due) : null,
    sourceUrl: row.source_url,
    contributionExternalId: row.contribution_ext_id,
    utteredAt: isoDateOnly(row.uttered_at),
    context: "pmqs",
    extractedBy: row.extracted_by,
    occurrences: row.occurrences,
  };
}

export async function recordLedgerClaims(
  claims: LedgerClaim[],
  debateExtId: string,
): Promise<void> {
  for (const claim of claims) {
    await sql`
      INSERT INTO pooter.ledger_claims (
        id, member_id, speaker_name, party, constituency,
        verbatim_quote, normalized_claim, claim_type, topic, resolution_due,
        source_kind, source_url, contribution_ext_id, debate_ext_id,
        uttered_at, context, extracted_by, occurrences
      ) VALUES (
        ${claim.id},
        ${claim.speaker.memberId},
        ${claim.speaker.name},
        ${claim.speaker.party},
        ${claim.speaker.constituency},
        ${claim.verbatimQuote},
        ${claim.normalizedClaim},
        ${claim.claimType},
        ${claim.topic},
        ${claim.resolutionDue},
        ${"hansard-pmqs"},
        ${claim.sourceUrl},
        ${claim.contributionExternalId},
        ${debateExtId},
        ${claim.utteredAt},
        ${claim.context},
        ${sql.json(claim.extractedBy as unknown as Parameters<typeof sql.json>[0])},
        ${claim.occurrences}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

/** Unresolved claims in resolvable topics, newest sittings first. */
export async function listResolvableUnresolvedClaims(
  limit = 50,
): Promise<LedgerClaim[]> {
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE status = 'unresolved'
      AND claim_type = 'retrodictable'
      AND topic IN ('voting-record', 'statistics')
    ORDER BY uttered_at DESC, created_at ASC
    LIMIT ${Math.max(1, Math.min(200, limit))}
  `;
  return rows.map(rowToClaim);
}

export async function listLedgerClaimsForDebate(
  debateExtId: string,
): Promise<LedgerClaim[]> {
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE debate_ext_id = ${debateExtId} AND status = 'unresolved'
    ORDER BY uttered_at DESC, speaker_name ASC
  `;
  return rows.map(rowToClaim);
}
