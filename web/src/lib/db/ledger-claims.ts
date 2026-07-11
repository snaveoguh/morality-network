// ledger_claims repo — Claim Ledger Phase A persistence.
// Writers: PMQs ingest (cron + on-demand extraction). Readers: /ledger page,
// /api/ledger/claims. Schema: web/migrations/002_claim_ledger.sql.

import { sql } from "../db";
import type { LedgerClaim, LedgerContext } from "../ledger/types";

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
  context?: LedgerContext;
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
    context: row.context ?? "pmqs",
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
        ${`hansard-${claim.context}`},
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

/**
 * Debate ext ids already attempted (whether or not claims were found).
 * Backed by ledger_ingested_debates so zero-claim sittings do not retry
 * forever (migration 005).
 */
export async function ingestedDebateExtIds(
  extIds: string[],
): Promise<Set<string>> {
  if (extIds.length === 0) return new Set();
  const rows = await sql<Array<{ debate_ext_id: string }>>`
    SELECT debate_ext_id FROM pooter.ledger_ingested_debates
    WHERE debate_ext_id IN ${sql(extIds)}
  `;
  return new Set(rows.map((r) => r.debate_ext_id));
}

/** Record an ingest attempt, whatever it yielded. */
export async function markDebateIngested(params: {
  debateExtId: string;
  context: LedgerContext;
  sittingDate: string;
  claimsCount: number;
}): Promise<void> {
  await sql`
    INSERT INTO pooter.ledger_ingested_debates
      (debate_ext_id, context, sitting_date, claims_count)
    VALUES (${params.debateExtId}, ${params.context}, ${params.sittingDate}, ${params.claimsCount})
    ON CONFLICT (debate_ext_id) DO NOTHING
  `;
}

/** All claims by one member, newest first (entity page). */
export async function listLedgerClaimsForMember(
  memberId: number,
  limit = 500,
): Promise<LedgerClaim[]> {
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, context, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE member_id = ${memberId}
    ORDER BY uttered_at DESC, created_at ASC
    LIMIT ${Math.max(1, Math.min(2000, limit))}
  `;
  return rows.map(rowToClaim);
}

/** Claim counts per debate (manifesto/backfill listing pages). */
export async function countClaimsByDebate(
  extIds: string[],
): Promise<Map<string, number>> {
  if (extIds.length === 0) return new Map();
  const rows = await sql<Array<{ debate_ext_id: string; n: number }>>`
    SELECT debate_ext_id, COUNT(*)::int AS n
    FROM pooter.ledger_claims
    WHERE debate_ext_id IN ${sql(extIds)}
    GROUP BY debate_ext_id
  `;
  return new Map(rows.map((r) => [r.debate_ext_id, r.n]));
}

/** Claims recorded on a given UTC day (Merkle batching). */
export async function listLedgerClaimsCreatedOn(
  day: string,
): Promise<LedgerClaim[]> {
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, context, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE created_at >= ${`${day}T00:00:00Z`}
      AND created_at < (${`${day}T00:00:00Z`}::timestamptz + interval '1 day')
    ORDER BY id ASC
  `;
  return rows.map(rowToClaim);
}

/** Unresolved claims in resolvable topics, newest sittings first. */
export async function listResolvableUnresolvedClaims(
  limit = 50,
): Promise<LedgerClaim[]> {
  const rows = await sql<LedgerClaimRow[]>`
    SELECT id, member_id, speaker_name, party, constituency, verbatim_quote,
           normalized_claim, claim_type, topic, resolution_due, source_url,
           contribution_ext_id, uttered_at, context, extracted_by, occurrences
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
           contribution_ext_id, uttered_at, context, extracted_by, occurrences
    FROM pooter.ledger_claims
    WHERE debate_ext_id = ${debateExtId}
    ORDER BY uttered_at DESC, speaker_name ASC
  `;
  return rows.map(rowToClaim);
}
