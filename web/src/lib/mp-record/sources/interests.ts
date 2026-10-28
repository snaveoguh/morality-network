// Source: Register of Members' Financial Interests (interests-api.parliament.uk).
// Pure parsers. Every field of every entry is kept verbatim in `fields`; the
// typed columns are deterministic extracts of named register fields only.
//
// Known register-API gap (checked 2026-10-28): category 4 (visits outside the
// UK) returns `Donors` and `VisitLocations` as null on both the list and the
// single-record endpoints, so visits carry no donor or value here. They count
// as "no stated value" in stats; nothing is filled in from elsewhere.

import { contentHash } from "../hash";
import {
  moneyToDecimal,
  nonEmpty,
  parseIntOrNull,
  parseRegisterDate,
} from "../parse-utils";
import type { CounterpartyKind, FactRecord, InterestData, RegisterField } from "../types";
import { memberScopeKey } from "./members";

export const INTERESTS_API = "https://interests-api.parliament.uk/api/v1";
export const INTERESTS_PARSER_VERSION = "interests-v1";
export const INTERESTS_PAGE_SIZE = 20;

/** Register top-level categories, verbatim from GET /Categories (Commons). */
export const REGISTER_TOP_LEVEL_CATEGORIES: Record<string, string> = {
  "1": "Employment and earnings",
  "2": "Donations and other support (including loans) for activities as an MP",
  "3": "Gifts, benefits and hospitality from UK sources",
  "4": "Visits outside the UK",
  "5": "Gifts and benefits from sources outside the UK",
  "6": "Land and property (within or outside the UK)",
  "7": "Shareholdings",
  "8": "Miscellaneous",
  "9": "Family members employed",
  "10": "Family members engaged in third-party lobbying",
};

/** Categories whose named person is a family member, not a counterparty of the MP. */
const FAMILY_CATEGORIES = new Set(["9", "10"]);

export function interestsPageUrl(memberId: number, skip: number, take = INTERESTS_PAGE_SIZE): string {
  const q = new URLSearchParams({
    MemberId: String(memberId),
    ExpandChildInterests: "true",
    Take: String(take),
    Skip: String(skip),
  });
  return `${INTERESTS_API}/Interests?${q}`;
}
export function interestApiUrl(interestId: number): string {
  return `${INTERESTS_API}/Interests/${interestId}`;
}
export function memberRegisterUrl(memberId: number): string {
  return `https://members.parliament.uk/member/${memberId}/registeredinterests`;
}

export function topLevelCategory(categoryNumber: string | null): string | null {
  if (!categoryNumber) return null;
  return categoryNumber.split(".")[0] || null;
}

function mapFields(raw: unknown): RegisterField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any) => ({
    name: String(f?.name ?? ""),
    description: String(f?.description ?? ""),
    type: String(f?.type ?? ""),
    currencyCode: nonEmpty(f?.typeInfo?.currencyCode),
    value: f?.value ?? null,
  }));
}

function field(fields: RegisterField[], name: string): RegisterField | undefined {
  return fields.find((f) => f.name === name);
}
function fieldString(fields: RegisterField[], name: string): string | null {
  return nonEmpty(field(fields, name)?.value);
}

/**
 * Counterparty kind from the register's OWN status fields. Mapping (spec
 * §4.2): PayerIsPrivateIndividual true → person, false → organisation;
 * DonorStatus "Individual" → person; company/union/partnership/party/
 * association/trust/society → organisation; shareholdings → organisation;
 * anything else ("Other", absent) → unknown.
 */
const ORGANISATION_STATUSES = new Set([
  "company",
  "trade union",
  "limited liability partnership",
  "registered party",
  "unincorporated association",
  "trust",
  "friendly society",
]);

export function counterpartyKindFromStatus(status: string | null): CounterpartyKind {
  if (!status) return "unknown";
  const s = status.trim().toLowerCase();
  if (s === "individual") return "person";
  if (ORGANISATION_STATUSES.has(s)) return "organisation";
  return "unknown";
}

interface ParentContext {
  payer: string | null;
  kind: CounterpartyKind;
  memberId: number;
}

function payerOf(categoryTop: string | null, fields: RegisterField[]): { name: string | null; kind: CounterpartyKind } {
  if (categoryTop && FAMILY_CATEGORIES.has(categoryTop)) return { name: null, kind: "unknown" };
  const payer = fieldString(fields, "PayerName");
  if (payer) {
    const priv = field(fields, "PayerIsPrivateIndividual")?.value;
    return { name: payer, kind: priv === true ? "person" : priv === false ? "organisation" : "unknown" };
  }
  const donor = fieldString(fields, "DonorName");
  if (donor) return { name: donor, kind: counterpartyKindFromStatus(fieldString(fields, "DonorStatus")) };
  const org = fieldString(fields, "OrganisationName");
  if (org) return { name: org, kind: "organisation" };
  return { name: null, kind: "unknown" };
}

function parseOne(
  item: Record<string, any>,
  parent: ParentContext | null,
  rawFetchId: number | null,
): FactRecord<"mp_interests"> {
  const interestId = parseIntOrNull(item.id);
  if (interestId === null) throw new Error("parseInterests: entry without numeric id");
  const memberId = parseIntOrNull(item.member?.id) ?? parent?.memberId ?? null;
  if (memberId === null) throw new Error(`parseInterests: entry ${interestId} has no member id`);

  const fields = mapFields(item.fields);
  const categoryNumber = nonEmpty(item.category?.number);
  const top = topLevelCategory(categoryNumber);
  const own = payerOf(top, fields);
  const useParent = own.name === null && parent?.payer != null;

  const valueField = field(fields, "Value");
  const amount = moneyToDecimal(valueField?.value ?? null);
  const currency = amount === null ? null : valueField?.currencyCode ?? null;

  const data: InterestData = {
    memberId,
    interestId,
    parentInterestId: parseIntOrNull(item.parentInterestId),
    categoryId: parseIntOrNull(item.category?.id),
    categoryNumber,
    categoryName: nonEmpty(item.category?.name),
    summary: nonEmpty(item.summary),
    payerOrDonorName: useParent ? parent!.payer : own.name,
    payerFromParent: useParent,
    counterpartyKind: useParent ? parent!.kind : own.kind,
    valueGbp: currency === "GBP" ? amount : null,
    valueAmount: amount,
    valueCurrency: currency,
    isRegularPayment: categoryNumber === "1.2",
    receivedDate: parseRegisterDate(field(fields, "ReceivedDate")?.value),
    startDate:
      parseRegisterDate(field(fields, "StartDate")?.value) ??
      parseRegisterDate(field(fields, "RegistrableDate")?.value),
    endDate: parseRegisterDate(field(fields, "EndDate")?.value),
    registrationDate: parseRegisterDate(item.registrationDate),
    publishedDate: parseRegisterDate(item.publishedDate),
    updatedDates: (Array.isArray(item.updatedDates) ? item.updatedDates : [])
      .map((d: unknown) => parseRegisterDate(d))
      .filter((d: string | null): d is string => d !== null),
    rectified: Boolean(item.rectified),
    rectifiedDetails: nonEmpty(item.rectifiedDetails),
    fields,
  };

  return {
    table: "mp_interests",
    scopeKey: memberScopeKey(memberId),
    sourceRecordId: String(interestId),
    data,
    contentHash: contentHash(data),
    sourceUrl: memberRegisterUrl(memberId),
    sourceApiUrl: interestApiUrl(interestId),
    parserVersion: INTERESTS_PARSER_VERSION,
    rawFetchId,
  };
}

export interface InterestsPage {
  records: FactRecord<"mp_interests">[];
  /** Top-level entries on this page (what totalResults counts). */
  topLevelCount: number;
  totalResults: number;
  skip: number;
  take: number;
}

/**
 * One page of GET /Interests?MemberId=…&ExpandChildInterests=true. Child
 * interests are flattened into their own records; a child with no payer of
 * its own carries the payer named on its parent (payerFromParent = true).
 */
export function parseInterestsPage(json: unknown, rawFetchId: number | null = null): InterestsPage {
  const body = json as Record<string, any> | null;
  if (!body || !Array.isArray(body.items) || typeof body.totalResults !== "number") {
    throw new Error("parseInterestsPage: response is not an interests page");
  }
  const records: FactRecord<"mp_interests">[] = [];
  for (const item of body.items) {
    const parentRecord = parseOne(item, null, rawFetchId);
    records.push(parentRecord);
    const ctx: ParentContext = {
      payer: parentRecord.data.payerOrDonorName,
      kind: parentRecord.data.counterpartyKind,
      memberId: parentRecord.data.memberId,
    };
    for (const child of Array.isArray(item.childInterests) ? item.childInterests : []) {
      records.push(parseOne(child, ctx, rawFetchId));
    }
  }
  return {
    records,
    topLevelCount: body.items.length,
    totalResults: body.totalResults,
    skip: Number(body.skip ?? 0),
    take: Number(body.take ?? body.items.length),
  };
}
