// Who a member is, for the ledger profile page: name, party, seat, portrait
// and the posts they hold or have held — copied from the Parliament Members
// API through the MP Record's own parsers. The generated Synopsis is not used.
//
// Returns null on any failure: the profile must render from the ledger's own
// data when Parliament's API is slow or down.

import "server-only";

import { fetchWithRetry } from "../fetch-utils";
import {
  biographyApiUrl,
  memberApiUrl,
  parseBiography,
  parseMember,
} from "../mp-record/sources/members";
import type { MemberData, MemberPeriodData } from "../mp-record/types";

export interface MemberIdentity {
  member: MemberData;
  /** Dated posts, committees and party/seat history; [] when unavailable. */
  periods: MemberPeriodData[];
}

const INIT = { headers: { Accept: "application/json" }, next: { revalidate: 86_400 } };

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetchWithRetry(url, INIT, undefined, 8_000);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function getMemberIdentity(memberId: number): Promise<MemberIdentity | null> {
  const [memberJson, bioJson] = await Promise.all([
    getJson(memberApiUrl(memberId)),
    getJson(biographyApiUrl(memberId)),
  ]);
  if (!memberJson) return null;
  try {
    const member = parseMember(memberJson).data;
    let periods: MemberPeriodData[] = [];
    if (bioJson) {
      try {
        periods = parseBiography(bioJson, memberId).map((p) => p.data);
      } catch (error) {
        console.warn("[ledger/member-identity] biography parse failed:", error);
      }
    }
    return { member, periods };
  } catch (error) {
    console.warn("[ledger/member-identity] member parse failed:", error);
    return null;
  }
}

/** Posts with no end date, newest first — what the member does now. */
export function currentPosts(periods: MemberPeriodData[]): MemberPeriodData[] {
  return periods
    .filter((p) => (p.kind === "government_post" || p.kind === "opposition_post") && !p.endDate)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}
