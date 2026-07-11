// Funding source: Register of Members' Financial Interests.
// interests-api.parliament.uk — official Parliament API, free, no auth.
// Swagger: https://interests-api.parliament.uk/index.html
// Verified live 2026-07-11 (probe log in docs/FUNDING_MAP_NOTES.md).
//
// Member IDs are canonical Parliament Member IDs (members-api.parliament.uk),
// the same key the ledger's entities table uses. Each interest's document URL
// is its own API record plus the member's public register page.

import { fetchWithRetry } from "../fetch-utils";
import type { FundingEdge } from "./types";

const INTERESTS_API = "https://interests-api.parliament.uk/api/v1";
const MEMBER_REGISTER_WEB = "https://members.parliament.uk/member";

export interface InterestCategory {
  id: number;
  /** Register numbering, e.g. "1", "1.1", "3". */
  number: string;
  name: string;
  parentCategoryIds: number[];
  /** "Commons" | "Lords" */
  type: string;
}

/** One field of an interest, verbatim from the register (shape varies by category). */
export interface InterestField {
  name: string;
  description: string;
  type: string; // "String" | "Decimal" | "DateOnly" | "Boolean" | ...
  value: string | number | boolean | null;
}

export interface MemberInterestRecord {
  id: number;
  /** Register's own one-line summary, e.g. "The Arsenal Football Club Limited - £1,000.00". */
  summary: string;
  /** Public register page for the member — the human-readable document. */
  sourceUrl: string;
  /** Stable API record for this exact interest (machine-readable document). */
  apiRecordUrl: string;
  category: InterestCategory;
  memberId: number;
  memberName: string;
  memberParty: string;
  house: string;
  registrationDate: string | null; // YYYY-MM-DD
  publishedDate: string | null; // YYYY-MM-DD
  /** All register fields, verbatim. Presence varies by category. */
  fields: InterestField[];
  /** Convenience extracts — undefined means the register does not state them. */
  donorName?: string;
  donorStatus?: string;
  /** Companies House number when the register itself provides one. */
  donorCompanyNumber?: string;
  valueGbp?: number;
  receivedDate?: string;
  /** True when the entry was later rectified; details stay on the record. */
  rectified: boolean;
}

export function memberRegisterUrl(memberId: number): string {
  return `${MEMBER_REGISTER_WEB}/${memberId}/registeredinterests`;
}

function fieldValue(fields: InterestField[], name: string): InterestField["value"] {
  return fields.find((f) => f.name === name)?.value ?? null;
}

function asOptionalString(v: InterestField["value"]): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function mapCategory(c: any): InterestCategory {
  return {
    id: c?.id ?? 0,
    number: String(c?.number ?? ""),
    name: c?.name ?? "",
    parentCategoryIds: Array.isArray(c?.parentCategoryIds) ? c.parentCategoryIds : [],
    type: c?.type ?? "",
  };
}

function mapInterest(item: any): MemberInterestRecord {
  const fields: InterestField[] = (Array.isArray(item?.fields) ? item.fields : []).map(
    (f: any): InterestField => ({
      name: String(f?.name ?? ""),
      description: String(f?.description ?? ""),
      type: String(f?.type ?? ""),
      value: f?.value ?? null,
    }),
  );
  const memberId = item?.member?.id ?? 0;
  const rawValue = fieldValue(fields, "Value");
  const valueGbp =
    rawValue === null || rawValue === "" ? undefined : Number(rawValue);

  return {
    id: item?.id ?? 0,
    summary: item?.summary ?? "",
    sourceUrl: memberRegisterUrl(memberId),
    apiRecordUrl: `${INTERESTS_API}/Interests/${item?.id}`,
    category: mapCategory(item?.category),
    memberId,
    memberName: item?.member?.nameDisplayAs ?? "",
    memberParty: item?.member?.party ?? "",
    house: item?.member?.house ?? "",
    registrationDate: item?.registrationDate ?? null,
    publishedDate: item?.publishedDate ?? null,
    fields,
    donorName: asOptionalString(fieldValue(fields, "DonorName")),
    donorStatus: asOptionalString(fieldValue(fields, "DonorStatus")),
    donorCompanyNumber: asOptionalString(fieldValue(fields, "DonorCompanyIdentifier")),
    valueGbp: Number.isFinite(valueGbp) ? valueGbp : undefined,
    receivedDate: asOptionalString(fieldValue(fields, "ReceivedDate")),
    rectified: Boolean(item?.rectified),
  };
}

/** All register categories (12 top-level + sub-categories for Commons). */
export async function fetchInterestCategories(): Promise<InterestCategory[]> {
  try {
    const res = await fetchWithRetry(
      `${INTERESTS_API}/Categories?Take=50`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data?.items) ? data.items : []).map(mapCategory);
  } catch (error) {
    console.error("[funding/members-interests] categories failed:", error);
    return [];
  }
}

/**
 * Registered interests for one member (canonical Parliament Member ID).
 * Paged; newest published first.
 */
export async function fetchMemberInterests(
  memberId: number,
  opts: {
    categoryId?: number;
    publishedFrom?: string; // YYYY-MM-DD
    publishedTo?: string; // YYYY-MM-DD
    take?: number;
    skip?: number;
  } = {},
): Promise<MemberInterestRecord[]> {
  const query = new URLSearchParams();
  query.set("MemberId", String(memberId));
  query.set("Take", String(opts.take ?? 25));
  query.set("Skip", String(opts.skip ?? 0));
  if (opts.categoryId) query.set("CategoryId", String(opts.categoryId));
  if (opts.publishedFrom) query.set("PublishedFrom", opts.publishedFrom);
  if (opts.publishedTo) query.set("PublishedTo", opts.publishedTo);

  try {
    const res = await fetchWithRetry(
      `${INTERESTS_API}/Interests?${query}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data?.items) ? data.items : []).map(mapInterest);
  } catch (error) {
    console.error("[funding/members-interests] member interests failed:", error);
    return [];
  }
}

/** One interest by its register id, or null. */
export async function fetchInterest(id: number): Promise<MemberInterestRecord | null> {
  try {
    const res = await fetchWithRetry(
      `${INTERESTS_API}/Interests/${id}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    return mapInterest(await res.json());
  } catch (error) {
    console.error("[funding/members-interests] interest fetch failed:", error);
    return null;
  }
}

/**
 * Map a register entry to a money-map edge, ONLY when the register itself
 * names a counterparty (DonorName). Entries without a stated donor (e.g.
 * shareholdings, land) are not edges to an external party from this record
 * alone — returning null keeps the no-inferred-edges rule intact.
 */
export function interestToEdge(i: MemberInterestRecord): FundingEdge | null {
  if (!i.donorName) return null;
  return {
    sourceUrl: i.sourceUrl,
    documentKind: "members_interest",
    from: {
      name: i.donorName,
      role: i.donorStatus ?? "(status not stated in register)",
      companyNumber: i.donorCompanyNumber,
    },
    to: {
      name: i.memberName,
      role: `${i.house} member`,
      parliamentMemberId: i.memberId,
    },
    amountGbp: i.valueGbp,
    date: i.receivedDate ?? i.registrationDate ?? i.publishedDate ?? "",
    registryRef: String(i.id),
    description: i.summary || i.category.name,
  };
}
