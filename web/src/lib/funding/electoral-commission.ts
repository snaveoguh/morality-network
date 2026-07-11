// Funding source: Electoral Commission donations register.
// search.electoralcommission.org.uk/api/search/Donations — free, no auth.
// This is the JSON API behind the Commission's own search UI. Verified live
// 2026-07-11 (see docs/FUNDING_MAP_NOTES.md for probe log + sample responses).
//
// Every record links back to its public register page via ECRef
// (https://search.electoralcommission.org.uk/English/Donations/{ECRef}),
// which is the document URL the money map uses for the edge.

import { fetchWithRetry } from "../fetch-utils";
import { parseDotNetDate, type FundingEdge } from "./types";

const EC_API = "https://search.electoralcommission.org.uk/api/search/Donations";
const EC_RECORD_WEB = "https://search.electoralcommission.org.uk/English/Donations";

/**
 * `et` filter values accepted by the search API.
 * pp = political parties, rd = regulated donees (MPs, mayors, members
 * associations…), tp = third parties (non-party campaigners), perpar = permitted participants.
 */
export type EcEntityType = "pp" | "rd" | "tp" | "perpar";

export interface EcDonationRecord {
  /** Commission's public reference, e.g. "C0838114". */
  ecRef: string;
  /** Public register page for this exact donation — the edge's document link. */
  sourceUrl: string;
  donorName: string;
  /** Registry's donor status, verbatim: "Company", "Individual", "Trade Union", … */
  donorStatus: string;
  /** Companies House number when the register states one. */
  companyRegistrationNumber?: string;
  /** Recipient as registered (party, MP, members association…). */
  regulatedEntityName: string;
  /** Verbatim recipient type: "Political Party", "MP - Member of Parliament", … */
  regulatedEntityType: string;
  /** Sub-type for regulated donees (e.g. "Mayor", "Members Association"), when stated. */
  regulatedDoneeType?: string;
  valueGbp: number;
  donationType: string; // "Cash", "Non Cash", "Visit", …
  /** ISO dates; null when the register leaves the field empty (a registry gap). */
  acceptedDate: string | null;
  receivedDate: string | null;
  reportedDate: string | null;
  reportingPeriodName: string;
  isSponsorship: boolean;
  accountingUnitName?: string;
}

export function donationDocumentUrl(ecRef: string): string {
  return `${EC_RECORD_WEB}/${encodeURIComponent(ecRef)}`;
}

/**
 * Search the donations register. All filters map 1:1 onto the register's own
 * search API; results are register rows, nothing derived.
 *
 * Verified param shapes:
 * - `query` — full-text over donor/recipient names (e.g. "Bamford")
 * - `date=Accepted&from=YYYY-MM-DD&to=YYYY-MM-DD` — accepted-date window
 * - `et` — recipient entity type (see EcEntityType)
 */
export async function searchDonations(params: {
  query?: string;
  acceptedFrom?: string; // YYYY-MM-DD
  acceptedTo?: string; // YYYY-MM-DD
  entityType?: EcEntityType;
  start?: number;
  rows?: number;
}): Promise<EcDonationRecord[]> {
  const query = new URLSearchParams();
  query.set("start", String(params.start ?? 0));
  query.set("rows", String(params.rows ?? 25));
  query.set("query", params.query ?? "");
  query.set("sort", "AcceptedDate");
  query.set("order", "desc");
  if (params.acceptedFrom || params.acceptedTo) {
    query.set("date", "Accepted");
    if (params.acceptedFrom) query.set("from", params.acceptedFrom);
    if (params.acceptedTo) query.set("to", params.acceptedTo);
  }
  if (params.entityType) query.set("et", params.entityType);

  try {
    const res = await fetchWithRetry(
      `${EC_API}?${query}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    return rows
      .filter((d: any) => d?.ECRef)
      .map((d: any): EcDonationRecord => ({
        ecRef: String(d.ECRef),
        sourceUrl: donationDocumentUrl(String(d.ECRef)),
        donorName: String(d.DonorName ?? "").trim() || "(not stated in register)",
        donorStatus: d.DonorStatus ?? "Unknown",
        companyRegistrationNumber: d.CompanyRegistrationNumber || undefined,
        regulatedEntityName: d.RegulatedEntityName ?? "",
        regulatedEntityType: d.RegulatedEntityType ?? "",
        regulatedDoneeType: d.RegulatedDoneeType || undefined,
        valueGbp: Number(d.Value ?? 0),
        donationType: d.DonationType ?? "",
        acceptedDate: parseDotNetDate(d.AcceptedDate),
        receivedDate: parseDotNetDate(d.ReceivedDate),
        reportedDate: parseDotNetDate(d.ReportedDate),
        reportingPeriodName: d.ReportingPeriodName ?? "",
        isSponsorship: Boolean(d.IsSponsorship),
        accountingUnitName: d.AccountingUnitName || undefined,
      }));
  } catch (error) {
    console.error("[funding/electoral-commission] search failed:", error);
    return [];
  }
}

/** Donations received by a named recipient (party / donee), by accepted date. */
export async function donationsToRecipient(
  recipientName: string,
  opts: { acceptedFrom?: string; acceptedTo?: string; rows?: number } = {},
): Promise<EcDonationRecord[]> {
  const all = await searchDonations({ query: recipientName, ...opts });
  const needle = recipientName.toLowerCase();
  return all.filter((d) => d.regulatedEntityName.toLowerCase().includes(needle));
}

/** Donations made by a named donor, by accepted date. */
export async function donationsFromDonor(
  donorName: string,
  opts: { acceptedFrom?: string; acceptedTo?: string; rows?: number } = {},
): Promise<EcDonationRecord[]> {
  const all = await searchDonations({ query: donorName, ...opts });
  const needle = donorName.toLowerCase();
  return all.filter((d) => d.donorName.toLowerCase().includes(needle));
}

/** Map a register row to a money-map edge. Pure copy — nothing inferred. */
export function donationToEdge(d: EcDonationRecord): FundingEdge {
  return {
    sourceUrl: d.sourceUrl,
    documentKind: "electoral_commission_donation",
    from: {
      name: d.donorName,
      role: d.donorStatus,
      companyNumber: d.companyRegistrationNumber,
    },
    to: {
      name: d.regulatedEntityName,
      role: d.regulatedDoneeType ?? d.regulatedEntityType,
    },
    amountGbp: d.valueGbp,
    // Register's accepted date; falls back to received/reported when the
    // register leaves accepted blank. Empty string = gap in the registry.
    date: d.acceptedDate ?? d.receivedDate ?? d.reportedDate ?? "",
    registryRef: d.ecRef,
    description: `${d.donationType} donation, ${d.reportingPeriodName}`.trim(),
  };
}
