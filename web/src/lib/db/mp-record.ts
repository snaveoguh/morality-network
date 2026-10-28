// MP Record repo — Postgres implementation of the ingest store plus the read
// queries behind /api/mp/* and /mp/*. Schema: web/migrations/014_mp_record.sql.
// Fact tables are append-only (DB trigger); this file has no UPDATE or DELETE
// against them. Public reads go through the *_public views only.

import { createHash } from "node:crypto";
import { sql } from "../db";
import { isoDateOnly } from "./ledger-claims";
import type { RawFetchInput } from "../mp-record/http";
import type { AppendContext, AppendResult, IngestRun, MpStore } from "../mp-record/store";
import { countActions } from "../mp-record/store";
import type { VersionAction } from "../mp-record/versioning";
import type { LedgerClaimFact, StatInputs } from "../mp-record/stats";
import type {
  CurrentVersion,
  FactDataByTable,
  MpFactTable,
  MpSource,
  SourceCheck,
  SourceLink,
  SourceLinkProposal,
  StoredVersion,
} from "../mp-record/types";

type ColumnKind = "plain" | "date" | "json";
type ColumnMap = Array<[camel: string, column: string, kind?: ColumnKind]>;

/** data-field ↔ column mapping per fact table (provenance columns are common). */
const DATA_COLUMNS: Record<MpFactTable, ColumnMap> = {
  mp_members: [
    ["memberId", "member_id"], ["nameDisplay", "name_display"], ["nameList", "name_list"],
    ["nameFullTitle", "name_full_title"], ["nameAddressAs", "name_address_as"], ["gender", "gender"],
    ["house", "house"], ["latestPartyId", "latest_party_id"], ["latestPartyName", "latest_party_name"],
    ["constituencyId", "constituency_id"], ["constituencyName", "constituency_name"],
    ["membershipStartDate", "membership_start_date", "date"], ["membershipEndDate", "membership_end_date", "date"],
    ["membershipEndReason", "membership_end_reason"], ["statusIsActive", "status_is_active"],
    ["statusDescription", "status_description"], ["thumbnailUrl", "thumbnail_url"],
  ],
  mp_member_periods: [
    ["memberId", "member_id"], ["kind", "kind"], ["name", "name"], ["orgId", "org_id"], ["house", "house"],
    ["startDate", "start_date", "date"], ["endDate", "end_date", "date"],
    ["additionalInfo", "additional_info"], ["additionalInfoLink", "additional_info_link"],
  ],
  mp_interests: [
    ["memberId", "member_id"], ["interestId", "interest_id"], ["parentInterestId", "parent_interest_id"],
    ["categoryId", "category_id"], ["categoryNumber", "category_number"], ["categoryName", "category_name"],
    ["summary", "summary"], ["payerOrDonorName", "payer_or_donor_name"], ["payerFromParent", "payer_from_parent"],
    ["counterpartyKind", "counterparty_kind"], ["valueGbp", "value_gbp"], ["valueAmount", "value_amount"],
    ["valueCurrency", "value_currency"], ["isRegularPayment", "is_regular_payment"],
    ["receivedDate", "received_date", "date"], ["startDate", "start_date", "date"], ["endDate", "end_date", "date"],
    ["registrationDate", "registration_date", "date"], ["publishedDate", "published_date", "date"],
    ["updatedDates", "updated_dates", "json"], ["rectified", "rectified"], ["rectifiedDetails", "rectified_details"],
    ["fields", "fields", "json"],
  ],
  mp_donations: [
    ["ecRef", "ec_ref"], ["regulatedEntityId", "regulated_entity_id"], ["regulatedEntityName", "regulated_entity_name"],
    ["regulatedEntityType", "regulated_entity_type"], ["regulatedDoneeType", "regulated_donee_type"],
    ["donorId", "donor_id"], ["donorName", "donor_name"], ["donorStatus", "donor_status"],
    ["counterpartyKind", "counterparty_kind"], ["companyRegistrationNumber", "company_registration_number"],
    ["valueGbp", "value_gbp"], ["donationType", "donation_type"], ["natureOfDonation", "nature_of_donation"],
    ["purposeOfVisit", "purpose_of_visit"], ["donationAction", "donation_action"],
    ["acceptedDate", "accepted_date", "date"], ["receivedDate", "received_date", "date"],
    ["reportedDate", "reported_date", "date"], ["reportingPeriodName", "reporting_period_name"],
    ["isSponsorship", "is_sponsorship"], ["isAggregation", "is_aggregation"], ["isBequest", "is_bequest"],
    ["registerName", "register_name"], ["rawRow", "raw_row", "json"],
  ],
  mp_directorships: [
    ["chOfficerId", "ch_officer_id"], ["officerName", "officer_name"], ["companyNumber", "company_number"],
    ["companyName", "company_name"], ["companyStatus", "company_status"], ["officerRole", "officer_role"],
    ["appointedOn", "appointed_on", "date"], ["resignedOn", "resigned_on", "date"],
  ],
  mp_appgs: [
    ["appgName", "appg_name"], ["officerNameAsRegistered", "officer_name_as_registered"],
    ["officerRole", "officer_role"], ["registerEdition", "register_edition", "date"],
  ],
};

const PROVENANCE_COLUMNS = [
  "scope_key", "source_record_id", "version", "is_removed", "source_url", "source_api_url",
  "retrieved_at", "content_hash", "raw_fetch_id", "parser_version",
];

const FACT_TABLES = new Set<MpFactTable>(Object.keys(DATA_COLUMNS) as MpFactTable[]);
function assertTable(table: MpFactTable): string {
  if (!FACT_TABLES.has(table)) throw new Error(`unknown MP Record table ${table}`);
  return `pooter.${table}`;
}

type Row = Record<string, unknown>;

function toColumnValue(value: unknown, kind: ColumnKind = "plain") {
  if (kind === "json") return sql.json((value ?? null) as Parameters<typeof sql.json>[0]);
  return value ?? null;
}

function rowToVersion<T extends MpFactTable>(table: T, row: Row): StoredVersion<T> {
  const data: Row = {};
  for (const [camel, column, kind] of DATA_COLUMNS[table]) {
    const v = row[column];
    data[camel] = v === null || v === undefined ? null : kind === "date" ? isoDateOnly(v) : v;
  }
  if (table === "mp_interests" && !Array.isArray(data.updatedDates)) data.updatedDates = [];
  if (table === "mp_interests" && !Array.isArray(data.fields)) data.fields = [];
  return {
    table,
    scopeKey: String(row.scope_key),
    sourceRecordId: String(row.source_record_id),
    data: data as unknown as FactDataByTable[T],
    contentHash: String(row.content_hash),
    sourceUrl: String(row.source_url),
    sourceApiUrl: String(row.source_api_url),
    parserVersion: String(row.parser_version),
    rawFetchId: row.raw_fetch_id === null ? null : Number(row.raw_fetch_id),
    rowId: Number(row.row_id),
    version: Number(row.version),
    isRemoved: Boolean(row.is_removed),
    retrievedAt: new Date(row.retrieved_at as string).toISOString(),
  };
}

// ── Ingest store ────────────────────────────────────────────────────────────

export class PgMpStore implements MpStore {
  async recordRawFetch(raw: RawFetchInput): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      INSERT INTO pooter.mp_raw_fetches (source, url, http_status, content_type, body, body_sha256, first_seen_at, last_seen_at)
      VALUES (${raw.source}, ${raw.url}, ${raw.httpStatus}, ${raw.contentType}, ${raw.body}, ${raw.bodySha256}, ${raw.fetchedAt}, ${raw.fetchedAt})
      ON CONFLICT (url, body_sha256) DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        seen_count = pooter.mp_raw_fetches.seen_count + 1
      RETURNING id
    `;
    return Number(rows[0].id);
  }

  async startRun(run: Omit<IngestRun, "status" | "cursor">): Promise<void> {
    await sql`
      INSERT INTO pooter.mp_ingest_runs (id, sources, params)
      VALUES (${run.id}, ${run.sources}, ${sql.json(run.params)})
      ON CONFLICT (id) DO UPDATE SET status = 'running', finished_at = NULL, error = NULL
    `;
  }

  async getRun(id: string): Promise<IngestRun | null> {
    const rows = await sql<Array<{ id: string; sources: MpSource[]; params: IngestRun["params"]; status: IngestRun["status"]; cursor: { done?: string[] } }>>`
      SELECT id, sources, params, status, cursor FROM pooter.mp_ingest_runs WHERE id = ${id}
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, sources: r.sources, params: r.params, status: r.status, cursor: { done: r.cursor?.done ?? [] } };
  }

  async saveCursor(id: string, cursor: IngestRun["cursor"]): Promise<void> {
    await sql`UPDATE pooter.mp_ingest_runs SET cursor = ${sql.json(cursor)} WHERE id = ${id}`;
  }

  async finishRun(id: string, status: "completed" | "failed", stats: unknown, error?: string): Promise<void> {
    await sql`
      UPDATE pooter.mp_ingest_runs
      SET status = ${status}, stats = ${sql.json(stats as Parameters<typeof sql.json>[0])}, error = ${error ?? null}, finished_at = NOW()
      WHERE id = ${id}
    `;
  }

  async currentVersions(table: MpFactTable, scopeKey: string): Promise<CurrentVersion[]> {
    const rows = await sql<Array<{ source_record_id: string; version: number; content_hash: string; is_removed: boolean; row_id: string }>>`
      SELECT DISTINCT ON (source_record_id) source_record_id, version, content_hash, is_removed, row_id
      FROM ${sql(assertTable(table))}
      WHERE scope_key = ${scopeKey}
      ORDER BY source_record_id, version DESC
    `;
    return rows.map((r) => ({
      sourceRecordId: r.source_record_id,
      version: r.version,
      contentHash: r.content_hash,
      isRemoved: r.is_removed,
      rowId: Number(r.row_id),
    }));
  }

  async appendVersions(table: MpFactTable, actions: VersionAction[], ctx: AppendContext): Promise<AppendResult> {
    const target = assertTable(table);
    const dataColumns = DATA_COLUMNS[table].map(([, c]) => c);
    await sql.begin(async (tx) => {
      for (const a of actions) {
        if (a.kind === "remove") {
          // Tombstone: copy the previous row's content, mark removed.
          const cols = [...dataColumns, "scope_key", "source_record_id", "source_url", "source_api_url", "content_hash", "parser_version"];
          const list = cols.map((c) => `"${c}"`).join(", ");
          await tx.unsafe(
            `INSERT INTO ${target} (${list}, version, is_removed, retrieved_at, raw_fetch_id)
             SELECT ${list}, $1, TRUE, $2, $3 FROM ${target} WHERE row_id = $4`,
            [a.version, ctx.retrievedAt, ctx.rawFetchId, a.previousRowId],
          );
          continue;
        }
        const r = a.record;
        const row: Row = {};
        for (const [camel, column, kind] of DATA_COLUMNS[table]) {
          row[column] = toColumnValue((r.data as unknown as Row)[camel], kind);
        }
        Object.assign(row, {
          scope_key: r.scopeKey,
          source_record_id: r.sourceRecordId,
          version: a.version,
          is_removed: false,
          source_url: r.sourceUrl,
          source_api_url: r.sourceApiUrl,
          retrieved_at: ctx.retrievedAt,
          content_hash: r.contentHash,
          raw_fetch_id: r.rawFetchId,
          parser_version: r.parserVersion,
        });
        const columns = [...dataColumns, ...PROVENANCE_COLUMNS];
        await tx`INSERT INTO ${tx(target)} ${tx(row as Record<string, never>, columns as never[])}`;
      }
    });
    return countActions(actions);
  }

  async recordSourceCheck(c: SourceCheck): Promise<void> {
    await sql`
      INSERT INTO pooter.mp_source_checks
        (run_id, source, scope_key, member_id, checked_at, n_records, n_inserted, n_changed, n_removed, raw_fetch_ids)
      VALUES (${c.runId}, ${c.source}, ${c.scopeKey}, ${c.memberId}, ${c.checkedAt}, ${c.nRecords},
              ${c.nInserted}, ${c.nChanged}, ${c.nRemoved}, ${c.rawFetchIds})
    `;
  }

  async proposeLinks(proposals: SourceLinkProposal[]): Promise<number> {
    let n = 0;
    for (const p of proposals) {
      const rows = await sql`
        INSERT INTO pooter.mp_source_links
          (member_id, source, external_id, external_name, match_method, match_evidence, confidence, proposed_by)
        VALUES (${p.memberId}, ${p.source}, ${p.externalId}, ${p.externalName}, ${p.matchMethod},
                ${sql.json(p.matchEvidence as Parameters<typeof sql.json>[0])}, ${p.confidence}, ${p.proposedBy})
        ON CONFLICT (source, external_id, member_id) DO NOTHING
        RETURNING id
      `;
      n += rows.length;
    }
    return n;
  }

  async memberDisplayName(memberId: number): Promise<string | null> {
    const rows = await sql<Array<{ name_display: string | null }>>`
      SELECT name_display FROM pooter.mp_members_current WHERE member_id = ${memberId}
    `;
    return rows[0]?.name_display ?? null;
  }
}

// ── Link review (human only) ────────────────────────────────────────────────

function rowToLink(r: Row): SourceLink {
  return {
    id: Number(r.id),
    memberId: Number(r.member_id),
    source: r.source as SourceLink["source"],
    externalId: String(r.external_id),
    externalName: (r.external_name as string) ?? null,
    matchMethod: String(r.match_method),
    matchEvidence: (r.match_evidence as Record<string, unknown>) ?? {},
    confidence: r.confidence as SourceLink["confidence"],
    proposedBy: String(r.proposed_by),
    status: r.status as SourceLink["status"],
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
  };
}

export async function listSourceLinks(params: { status?: SourceLink["status"]; memberId?: number } = {}): Promise<SourceLink[]> {
  const rows = await sql<Row[]>`
    SELECT * FROM pooter.mp_source_links
    WHERE (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null})
      AND (${params.memberId ?? null}::int IS NULL OR member_id = ${params.memberId ?? null})
    ORDER BY member_id, source, id
  `;
  return rows.map(rowToLink);
}

/** A named human confirms or rejects a proposed link; logged append-only. */
export async function reviewSourceLink(
  linkId: number,
  decision: "confirmed" | "rejected",
  reviewer: string,
  note?: string,
): Promise<SourceLink | null> {
  if (!reviewer || reviewer.startsWith("llm:")) throw new Error("a named human reviewer is required");
  return sql.begin(async (tx) => {
    const rows = await tx<Row[]>`
      UPDATE pooter.mp_source_links
      SET status = ${decision}, reviewed_by = ${reviewer}, reviewed_at = NOW()
      WHERE id = ${linkId} AND status = 'proposed'
      RETURNING *
    `;
    if (rows.length === 0) return null;
    await tx`
      INSERT INTO pooter.mp_source_link_reviews (link_id, from_status, to_status, reviewed_by, note)
      VALUES (${linkId}, 'proposed', ${decision}, ${reviewer}, ${note ?? null})
    `;
    return rowToLink(rows[0]);
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface MpCheckSummary {
  source: string;
  scopeKey: string;
  checkedAt: string;
  nRecords: number;
}

export interface MpCorrection {
  id: number;
  memberId: number | null;
  subjectTable: string | null;
  subjectRecord: string | null;
  whatWasWrong: string;
  whatChanged: string;
  correctedAt: string;
}

export interface MpReply {
  id: string;
  subjectTable: string | null;
  subjectRecord: string | null;
  body: string;
  identity: string | null;
  response: string | null;
  createdAt: string;
}

export interface MpRecordData {
  member: StoredVersion<"mp_members"> | null;
  periods: StoredVersion<"mp_member_periods">[];
  interests: StoredVersion<"mp_interests">[];
  removedInterests: StoredVersion<"mp_interests">[];
  donations: Array<StoredVersion<"mp_donations">>;
  pendingLinkCount: number;
  checks: MpCheckSummary[];
  corrections: MpCorrection[];
  replies: MpReply[];
}

async function latestChecksForScopes(scopes: string[]): Promise<MpCheckSummary[]> {
  if (scopes.length === 0) return [];
  const rows = await sql<Array<{ source: string; scope_key: string; checked_at: string; n_records: number }>>`
    SELECT DISTINCT ON (source, scope_key) source, scope_key, checked_at, n_records
    FROM pooter.mp_source_checks
    WHERE scope_key IN ${sql(scopes)}
    ORDER BY source, scope_key, checked_at DESC
  `;
  return rows.map((r) => ({ source: r.source, scopeKey: r.scope_key, checkedAt: new Date(r.checked_at).toISOString(), nRecords: r.n_records }));
}

async function confirmedEcEntityIds(memberId: number): Promise<Array<{ externalId: string; reviewedAt: string }>> {
  const rows = await sql<Array<{ external_id: string; reviewed_at: string }>>`
    SELECT external_id, reviewed_at FROM pooter.mp_source_links
    WHERE member_id = ${memberId} AND source = 'electoral_commission' AND status = 'confirmed'
  `;
  return rows.map((r) => ({ externalId: r.external_id, reviewedAt: new Date(r.reviewed_at).toISOString() }));
}

export async function getMpRecordData(memberId: number): Promise<MpRecordData> {
  const memberScope = `member:${memberId}`;
  const [memberRows, periodRows, interestRows, removedRows, donationRows, pending, corrections, replies, ecLinks] = await Promise.all([
    sql<Row[]>`SELECT * FROM pooter.mp_members_current WHERE scope_key = ${memberScope}`,
    sql<Row[]>`SELECT * FROM pooter.mp_member_periods_current WHERE scope_key = ${memberScope} ORDER BY kind, start_date DESC NULLS LAST`,
    sql<Row[]>`SELECT * FROM pooter.mp_interests_current WHERE scope_key = ${memberScope}
               ORDER BY category_number, registration_date DESC NULLS LAST, interest_id DESC`,
    sql<Row[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (source_record_id) * FROM pooter.mp_interests
        WHERE scope_key = ${memberScope}
        ORDER BY source_record_id, version DESC
      ) latest WHERE is_removed ORDER BY retrieved_at DESC`,
    sql<Row[]>`SELECT * FROM pooter.mp_donations_public WHERE member_id = ${memberId}
               ORDER BY accepted_date DESC NULLS LAST, ec_ref`,
    sql<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM pooter.mp_source_links WHERE member_id = ${memberId} AND status = 'proposed'`,
    sql<Row[]>`SELECT * FROM pooter.mp_corrections WHERE member_id = ${memberId} OR member_id IS NULL ORDER BY corrected_at DESC LIMIT 200`,
    sql<Row[]>`SELECT * FROM pooter.mp_replies WHERE member_id = ${memberId} AND status = 'answered' ORDER BY created_at ASC`,
    confirmedEcEntityIds(memberId),
  ]);
  const checks = await latestChecksForScopes([memberScope, ...ecLinks.map((l) => `ec-entity:${l.externalId}`)]);
  return {
    member: memberRows[0] ? rowToVersion("mp_members", memberRows[0]) : null,
    periods: periodRows.map((r) => rowToVersion("mp_member_periods", r)),
    interests: interestRows.map((r) => rowToVersion("mp_interests", r)),
    removedInterests: removedRows.map((r) => rowToVersion("mp_interests", r)),
    donations: donationRows.map((r) => rowToVersion("mp_donations", r)),
    pendingLinkCount: pending[0]?.n ?? 0,
    checks,
    corrections: corrections.map((r) => ({
      id: Number(r.id),
      memberId: r.member_id === null ? null : Number(r.member_id),
      subjectTable: (r.subject_table as string) ?? null,
      subjectRecord: (r.subject_record as string) ?? null,
      whatWasWrong: String(r.what_was_wrong),
      whatChanged: String(r.what_changed),
      correctedAt: new Date(r.corrected_at as string).toISOString(),
    })),
    replies: replies.map((r) => ({
      id: String(r.id),
      subjectTable: (r.subject_table as string) ?? null,
      subjectRecord: (r.subject_record as string) ?? null,
      body: String(r.body),
      identity: (r.identity as string) ?? null,
      response: (r.response as string) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
    })),
  };
}

export interface MpTie {
  tieType: string;
  counterpartyName: string | null;
  counterpartyKind: string;
  valueGbp: string | null;
  /** Category 1.2 only: valueGbp is per this period (e.g. "Monthly"), not a total. */
  paymentRegularity: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  registerWording: string | null;
  sourceUrl: string;
  sourceRecordId: string;
  sourceTable: string;
  retrievedAt: string;
  contentHash: string;
}

export async function getMpTies(memberId: number): Promise<MpTie[]> {
  const rows = await sql<Row[]>`
    SELECT * FROM pooter.mp_ties WHERE member_id = ${memberId}
    ORDER BY period_start DESC NULLS LAST, source_table, source_record_id
  `;
  return rows.map((r) => ({
    tieType: String(r.tie_type),
    counterpartyName: (r.counterparty_name as string) ?? null,
    counterpartyKind: String(r.counterparty_kind),
    valueGbp: (r.value_gbp as string) ?? null,
    paymentRegularity: (r.payment_regularity as string) ?? null,
    periodStart: r.period_start ? isoDateOnly(r.period_start) : null,
    periodEnd: r.period_end ? isoDateOnly(r.period_end) : null,
    registerWording: (r.register_wording as string) ?? null,
    sourceUrl: String(r.source_url),
    sourceRecordId: String(r.source_record_id),
    sourceTable: String(r.source_table),
    retrievedAt: new Date(r.retrieved_at as string).toISOString(),
    contentHash: String(r.content_hash),
  }));
}

/** Every input a stat needs, as ALL versions (stats reconstruct any as-of). */
export async function getMpStatInputs(memberId: number, memberName: string): Promise<StatInputs> {
  const memberScope = `member:${memberId}`;
  const ecLinks = await confirmedEcEntityIds(memberId);
  const ecScopes = ecLinks.map((l) => `ec-entity:${l.externalId}`);
  const [interests, donations, checks, claims] = await Promise.all([
    sql<Row[]>`SELECT * FROM pooter.mp_interests WHERE scope_key = ${memberScope}`,
    ecScopes.length ? sql<Row[]>`SELECT * FROM pooter.mp_donations WHERE scope_key IN ${sql(ecScopes)}` : Promise.resolve([] as Row[]),
    sql<Array<{ source: string; scope_key: string; checked_at: string }>>`
      SELECT source, scope_key, checked_at FROM pooter.mp_source_checks
      WHERE scope_key IN ${sql([memberScope, ...ecScopes])}`,
    sql<Array<{ id: string; created_at: string; claim_type: LedgerClaimFact["claimType"]; verdict: LedgerClaimFact["verdict"]; published_at: string | null }>>`
      SELECT c.id, c.created_at, c.claim_type, r.verdict,
             COALESCE(r.reviewed_at, r.created_at) AS published_at
      FROM pooter.ledger_claims c
      LEFT JOIN pooter.ledger_resolutions r ON r.claim_id = c.id AND r.status = 'published'
      WHERE c.member_id = ${memberId}`,
  ]);
  return {
    memberId,
    memberName,
    interests: interests.map((r) => rowToVersion("mp_interests", r)),
    donations: donations.map((r) => rowToVersion("mp_donations", r)),
    ecLinks,
    checks: checks.map((c) => ({ source: c.source, scopeKey: c.scope_key, checkedAt: new Date(c.checked_at).toISOString() })),
    claims: claims.map((c) => ({
      claimId: c.id,
      createdAt: new Date(c.created_at).toISOString(),
      claimType: c.claim_type,
      verdict: c.verdict ?? null,
      verdictPublishedAt: c.published_at ? new Date(c.published_at).toISOString() : null,
    })),
  };
}

// ── Corrections + right of reply ────────────────────────────────────────────

export async function listAllCorrections(limit = 500): Promise<MpCorrection[]> {
  const rows = await sql<Row[]>`SELECT * FROM pooter.mp_corrections ORDER BY corrected_at DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`;
  return rows.map((r) => ({
    id: Number(r.id),
    memberId: r.member_id === null ? null : Number(r.member_id),
    subjectTable: (r.subject_table as string) ?? null,
    subjectRecord: (r.subject_record as string) ?? null,
    whatWasWrong: String(r.what_was_wrong),
    whatChanged: String(r.what_changed),
    correctedAt: new Date(r.corrected_at as string).toISOString(),
  }));
}

export async function logCorrection(c: {
  memberId: number | null;
  subjectTable?: string;
  subjectRecord?: string;
  whatWasWrong: string;
  whatChanged: string;
  reportedBy?: string;
  correctedBy: string;
}): Promise<void> {
  await sql`
    INSERT INTO pooter.mp_corrections (member_id, subject_table, subject_record, what_was_wrong, what_changed, reported_by, corrected_by)
    VALUES (${c.memberId}, ${c.subjectTable ?? null}, ${c.subjectRecord ?? null}, ${c.whatWasWrong}, ${c.whatChanged}, ${c.reportedBy ?? null}, ${c.correctedBy})
  `;
}

export async function createMpReply(p: {
  memberId: number;
  subjectTable?: string;
  subjectRecord?: string;
  body: string;
  contact: string;
  identity?: string;
}): Promise<string | null> {
  const id = createHash("sha256")
    .update(`${p.memberId}\n${p.subjectTable ?? ""}\n${p.subjectRecord ?? ""}\n${p.contact}\n${p.body}`)
    .digest("hex")
    .slice(0, 32);
  const rows = await sql`
    INSERT INTO pooter.mp_replies (id, member_id, subject_table, subject_record, body, contact, identity)
    VALUES (${id}, ${p.memberId}, ${p.subjectTable ?? null}, ${p.subjectRecord ?? null}, ${p.body}, ${p.contact}, ${p.identity ?? null})
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0 ? id : null;
}
