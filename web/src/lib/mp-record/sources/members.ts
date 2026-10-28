// Source: Parliament Members API (members-api.parliament.uk) — identity,
// party/constituency history, posts, committees. Pure parsers: JSON in,
// FactRecords out. The Synopsis endpoint is NOT used (generated prose).

import { contentHash } from "../hash";
import { nonEmpty, obj, parseIntOrNull, parseRegisterDate } from "../parse-utils";
import type {
  FactRecord,
  MemberData,
  MemberPeriodData,
  MemberPeriodKind,
} from "../types";

export const MEMBERS_API = "https://members-api.parliament.uk/api";
export const MEMBERS_PARSER_VERSION = "members-v1";

export function memberApiUrl(memberId: number): string {
  return `${MEMBERS_API}/Members/${memberId}`;
}
export function biographyApiUrl(memberId: number): string {
  return `${MEMBERS_API}/Members/${memberId}/Biography`;
}
export function memberProfileUrl(memberId: number): string {
  return `https://members.parliament.uk/member/${memberId}`;
}
export function memberCareerUrl(memberId: number): string {
  return `https://members.parliament.uk/member/${memberId}/career`;
}

export function memberScopeKey(memberId: number): string {
  return `member:${memberId}`;
}

function houseName(value: unknown): "Commons" | "Lords" | null {
  if (value === 1 || value === "Commons") return "Commons";
  if (value === 2 || value === "Lords") return "Lords";
  return null;
}

/** GET /Members/{id} → one mp_members record. Throws if the payload is not a member. */
export function parseMember(
  json: unknown,
  rawFetchId: number | null = null,
): FactRecord<"mp_members"> {
  const v = obj(obj(json).value);
  const memberId = parseIntOrNull(v.id);
  if (memberId === null) throw new Error("parseMember: response has no value.id");
  const hm = obj(v.latestHouseMembership);
  const status = obj(hm.membershipStatus);
  const party = obj(v.latestParty);
  const data: MemberData = {
    memberId,
    nameDisplay: nonEmpty(v.nameDisplayAs),
    nameList: nonEmpty(v.nameListAs),
    nameFullTitle: nonEmpty(v.nameFullTitle),
    nameAddressAs: nonEmpty(v.nameAddressAs),
    gender: nonEmpty(v.gender),
    house: houseName(hm.house),
    latestPartyId: parseIntOrNull(party.id),
    latestPartyName: nonEmpty(party.name),
    constituencyId: parseIntOrNull(hm.membershipFromId),
    constituencyName: nonEmpty(hm.membershipFrom),
    membershipStartDate: parseRegisterDate(hm.membershipStartDate),
    membershipEndDate: parseRegisterDate(hm.membershipEndDate),
    membershipEndReason: nonEmpty(hm.membershipEndReason),
    statusIsActive: typeof status.statusIsActive === "boolean" ? status.statusIsActive : null,
    statusDescription: nonEmpty(status.statusDescription),
    thumbnailUrl: nonEmpty(v.thumbnailUrl),
  };
  return {
    table: "mp_members",
    scopeKey: memberScopeKey(memberId),
    sourceRecordId: String(memberId),
    data,
    contentHash: contentHash(data),
    sourceUrl: memberProfileUrl(memberId),
    sourceApiUrl: memberApiUrl(memberId),
    parserVersion: MEMBERS_PARSER_VERSION,
    rawFetchId,
  };
}

const BIOGRAPHY_SECTIONS: Array<[string, MemberPeriodKind]> = [
  ["partyAffiliations", "party"],
  ["representations", "constituency"],
  ["houseMemberships", "house"],
  ["governmentPosts", "government_post"],
  ["oppositionPosts", "opposition_post"],
  ["otherPosts", "other_post"],
  ["committeeMemberships", "committee"],
];

/**
 * GET /Members/{id}/Biography → dated period records. source_record_id is
 * "<kind>:<orgId>:<startDate>"; exact repeats get a ":n" suffix in API order
 * so ids stay unique.
 */
export function parseBiography(
  json: unknown,
  memberId: number,
  rawFetchId: number | null = null,
): FactRecord<"mp_member_periods">[] {
  const raw = obj(json).value;
  if (raw === null || typeof raw !== "object") throw new Error("parseBiography: response has no value");
  const v = obj(raw);
  const out: FactRecord<"mp_member_periods">[] = [];
  const seen = new Map<string, number>();
  for (const [section, kind] of BIOGRAPHY_SECTIONS) {
    const items = Array.isArray(v[section]) ? (v[section] as unknown[]).map(obj) : [];
    for (const item of items) {
      const data: MemberPeriodData = {
        memberId,
        kind,
        name: nonEmpty(item.name),
        orgId: parseIntOrNull(item.id),
        house: houseName(item.house),
        startDate: parseRegisterDate(item.startDate),
        endDate: parseRegisterDate(item.endDate),
        additionalInfo: nonEmpty(item.additionalInfo),
        additionalInfoLink: nonEmpty(item.additionalInfoLink),
      };
      const base = `${kind}:${data.orgId ?? "?"}:${data.startDate ?? "?"}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push({
        table: "mp_member_periods",
        scopeKey: memberScopeKey(memberId),
        sourceRecordId: n === 1 ? base : `${base}:${n}`,
        data,
        contentHash: contentHash(data),
        sourceUrl: memberCareerUrl(memberId),
        sourceApiUrl: biographyApiUrl(memberId),
        parserVersion: MEMBERS_PARSER_VERSION,
        rawFetchId,
      });
    }
  }
  return out;
}

/** GET /Members/Search?House=1&IsCurrentMember=true page → member ids + total. */
export function currentCommonsSearchUrl(skip: number, take = 20): string {
  return `${MEMBERS_API}/Members/Search?House=1&IsCurrentMember=true&skip=${skip}&take=${take}`;
}

export function parseMemberSearchPage(json: unknown): { memberIds: number[]; totalResults: number } {
  const body = json as { items?: Array<{ value?: { id?: unknown } }>; totalResults?: unknown } | null;
  if (!body || !Array.isArray(body.items) || typeof body.totalResults !== "number") {
    throw new Error("parseMemberSearchPage: not a search page");
  }
  const memberIds = body.items
    .map((i) => parseIntOrNull(i?.value?.id))
    .filter((id): id is number => id !== null);
  return { memberIds, totalResults: body.totalResults };
}
