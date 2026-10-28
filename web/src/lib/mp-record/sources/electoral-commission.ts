// Source: Electoral Commission donations register — the CSV "Export" behind
// search.electoralcommission.org.uk. Pure parsers + the deterministic link
// rule. EC rows carry no Parliament member_id: they reach an MP only through
// a human-CONFIRMED mp_source_links row (MP_RECORD_SPEC §6).

import { contentHash } from "../hash";
import {
  moneyToDecimal,
  nonEmpty,
  normaliseName,
  parseBool,
  parseCsv,
  parseIntOrNull,
  parseRegisterDate,
} from "../parse-utils";
import type { DonationData, FactRecord, SourceLinkProposal } from "../types";
import { counterpartyKindFromStatus } from "./interests";

export const EC_SEARCH_API = "https://search.electoralcommission.org.uk/api/search/Donations";
export const EC_CSV_API = "https://search.electoralcommission.org.uk/api/csv/Donations";
export const EC_RECORD_WEB = "https://search.electoralcommission.org.uk/English/Donations";
export const EC_PARSER_VERSION = "ec-csv-v1";
export const EC_MP_DONEE_TYPE = "MP - Member of Parliament";
export const EC_LINK_RULE = "rule:ec-exact-name-v1";
/** Hard cap on one export; a larger total is refused rather than truncated. */
export const EC_MAX_ROWS = 5000;

function query(params: { query: string; rows: number }): string {
  const q = new URLSearchParams({
    start: "0",
    rows: String(params.rows),
    query: params.query,
    sort: "AcceptedDate",
    order: "desc",
    et: "rd", // regulated donees (MPs, members associations, …)
  });
  return q.toString();
}

/** JSON search used only to read `Total`, so the CSV can be checked complete. */
export function ecTotalUrl(searchName: string): string {
  return `${EC_SEARCH_API}?${query({ query: searchName, rows: 1 })}`;
}
export function ecCsvUrl(searchName: string, rows: number): string {
  return `${EC_CSV_API}?${query({ query: searchName, rows })}`;
}
export function ecRecordUrl(ecRef: string): string {
  return `${EC_RECORD_WEB}/${encodeURIComponent(ecRef)}`;
}
export function ecScopeKey(regulatedEntityId: number): string {
  return `ec-entity:${regulatedEntityId}`;
}

/** The name we search the register with: display name minus honorifics. */
export function ecSearchName(memberDisplayName: string): string {
  return normaliseName(memberDisplayName)
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseEcTotal(json: unknown): number {
  const total = (json as { Total?: unknown } | null)?.Total;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new Error("parseEcTotal: response has no numeric Total");
  }
  return total;
}

function parseRow(row: Record<string, string>, csvUrl: string, rawFetchId: number | null): FactRecord<"mp_donations"> | null {
  const ecRef = nonEmpty(row.ECRef);
  const entityId = parseIntOrNull(row.RegulatedEntityId);
  if (!ecRef || entityId === null) return null;
  const data: DonationData = {
    ecRef,
    regulatedEntityId: entityId,
    regulatedEntityName: nonEmpty(row.RegulatedEntityName),
    regulatedEntityType: nonEmpty(row.RegulatedEntityType),
    regulatedDoneeType: nonEmpty(row.RegulatedDoneeType),
    donorId: parseIntOrNull(row.DonorId),
    donorName: nonEmpty(row.DonorName),
    donorStatus: nonEmpty(row.DonorStatus),
    counterpartyKind: counterpartyKindFromStatus(nonEmpty(row.DonorStatus)),
    companyRegistrationNumber: nonEmpty(row.CompanyRegistrationNumber),
    valueGbp: moneyToDecimal(row.Value),
    donationType: nonEmpty(row.DonationType),
    natureOfDonation: nonEmpty(row.NatureOfDonation),
    purposeOfVisit: nonEmpty(row.PurposeOfVisit),
    donationAction: nonEmpty(row.DonationAction),
    acceptedDate: parseRegisterDate(row.AcceptedDate),
    receivedDate: parseRegisterDate(row.ReceivedDate),
    reportedDate: parseRegisterDate(row.ReportedDate),
    reportingPeriodName: nonEmpty(row.ReportingPeriodName),
    isSponsorship: parseBool(row.IsSponsorship),
    isAggregation: parseBool(row.IsAggregation),
    isBequest: parseBool(row.IsBequest),
    registerName: nonEmpty(row.RegisterName),
    rawRow: { ...row },
  };
  return {
    table: "mp_donations",
    scopeKey: ecScopeKey(entityId),
    sourceRecordId: ecRef,
    data,
    contentHash: contentHash(data),
    sourceUrl: ecRecordUrl(ecRef),
    sourceApiUrl: csvUrl,
    parserVersion: EC_PARSER_VERSION,
    rawFetchId,
  };
}

export interface EcExport {
  /** Rows whose recipient is an MP as regulated donee. */
  mpDoneeRecords: FactRecord<"mp_donations">[];
  /** All rows in the export, any recipient (for the completeness check). */
  totalRows: number;
  /** Rows dropped because ECRef/RegulatedEntityId were missing. */
  unparseableRows: number;
}

/** Parse the CSV export. Throws on truncated/malformed CSV. */
export function parseEcCsv(csvText: string, csvUrl: string, rawFetchId: number | null = null): EcExport {
  const rows = parseCsv(csvText);
  const mpDoneeRecords: FactRecord<"mp_donations">[] = [];
  let unparseableRows = 0;
  for (const row of rows) {
    const rec = parseRow(row, csvUrl, rawFetchId);
    if (!rec) {
      unparseableRows += 1;
      continue;
    }
    if (rec.data.regulatedDoneeType === EC_MP_DONEE_TYPE) mpDoneeRecords.push(rec);
  }
  return { mpDoneeRecords, totalRows: rows.length, unparseableRows };
}

/**
 * Deterministic link rule ec-exact-name-v1: propose (never confirm) a link
 * from an EC regulated entity to a member when the entity is an MP donee and
 * its name, normalised, equals the member's display name, normalised.
 * Confidence 'high' — still only a proposal until a human confirms it.
 */
export function proposeEcLinks(
  memberId: number,
  memberDisplayName: string,
  records: FactRecord<"mp_donations">[],
): { proposals: SourceLinkProposal[]; unmatchedEntities: Array<{ id: number; name: string | null }> } {
  const target = normaliseName(memberDisplayName);
  const entities = new Map<number, string | null>();
  for (const r of records) entities.set(r.data.regulatedEntityId, r.data.regulatedEntityName);
  const proposals: SourceLinkProposal[] = [];
  const unmatchedEntities: Array<{ id: number; name: string | null }> = [];
  for (const [id, name] of entities) {
    const normalised = name ? normaliseName(name) : "";
    if (normalised && normalised === target) {
      proposals.push({
        memberId,
        source: "electoral_commission",
        externalId: String(id),
        externalName: name,
        matchMethod: EC_LINK_RULE,
        matchEvidence: {
          memberDisplayName,
          ecRegulatedEntityName: name,
          normalisedBoth: target,
          regulatedDoneeType: EC_MP_DONEE_TYPE,
        },
        confidence: "high",
        proposedBy: EC_LINK_RULE,
      });
    } else {
      unmatchedEntities.push({ id, name });
    }
  }
  return { proposals, unmatchedEntities };
}
