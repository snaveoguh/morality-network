// Funding module — shared types (Claim Ledger spec §Funding module).
// Money map where EVERY edge IS a document link. Registry-based only:
// no inferred edges, and registry gaps are reported as gaps, never suspicion.

/** The kind of registry document an edge is backed by. */
export type FundingDocumentKind =
  | "electoral_commission_donation" // EC donations register entry (ECRef)
  | "members_interest" // Register of Members' Financial Interests entry
  | "contract_award" // Contracts Finder OCDS award release
  | "ministerial_meeting"; // GOV.UK transparency publication row

/** A party on either end of an edge — donor, member, company, party, buyer, supplier. */
export interface FundingParty {
  name: string;
  /**
   * Registry role as stated in the source document (e.g. "Company",
   * "Individual", "Political Party", "MP - Member of Parliament").
   * Verbatim from the registry; never inferred.
   */
  role: string;
  /** Companies House number when the registry itself provides one. */
  companyNumber?: string;
  /** Parliament Member ID when the registry itself provides one. */
  parliamentMemberId?: number;
}

/**
 * One edge in the money map. Invariant: `sourceUrl` resolves to the registry
 * document that states this transfer/relationship. If a field is absent it is
 * absent in the registry — callers must render that as a registry gap.
 */
export interface FundingEdge {
  /** Link to the registry document this edge is copied from. Required, always. */
  sourceUrl: string;
  documentKind: FundingDocumentKind;
  /** Who the value flowed FROM, as stated in the document. */
  from: FundingParty;
  /** Who the value flowed TO, as stated in the document. */
  to: FundingParty;
  /** GBP value if the document states one. Absent = not stated, nothing more. */
  amountGbp?: number;
  /** ISO date (YYYY-MM-DD) the document attaches to the transfer (accepted/received/registered). */
  date: string;
  /** Registry's own reference for the record (ECRef, interest id, OCID). */
  registryRef: string;
  /** Short verbatim-or-near-verbatim description from the document, if any. */
  description?: string;
}

/** Parse .NET JSON dates ("/Date(1774998000000)/") to ISO YYYY-MM-DD, else null. */
export function parseDotNetDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /\/Date\((-?\d+)\)\//.exec(value);
  if (!match) return null;
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}
