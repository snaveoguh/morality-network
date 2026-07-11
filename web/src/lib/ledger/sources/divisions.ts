// Resolution source: Commons division records (voting-record claims).
// commonsvotes-api.parliament.uk — free, no auth. Sibling of lib/parliament.ts;
// adds the search + per-member endpoints the resolver needs.

import { fetchWithRetry } from "../../fetch-utils";

const COMMONS_API = "https://commonsvotes-api.parliament.uk/data";
const VOTES_WEB = "https://votes.parliament.uk/votes/commons/division";

export interface DivisionRecord {
  divisionId: number;
  title: string;
  date: string; // ISO date
  ayeCount: number;
  noCount: number;
  /** Set when queried for a specific member. */
  memberVotedAye?: boolean;
}

export function divisionUrl(divisionId: number): string {
  return `${VOTES_WEB}/${divisionId}`;
}

/** Full-text search of Commons divisions in a date window. */
export async function searchDivisions(params: {
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
}): Promise<DivisionRecord[]> {
  const query = new URLSearchParams();
  if (params.searchTerm) query.set("queryParameters.searchTerm", params.searchTerm);
  if (params.startDate) query.set("queryParameters.startDate", params.startDate);
  if (params.endDate) query.set("queryParameters.endDate", params.endDate);
  query.set("queryParameters.take", String(params.take ?? 25));

  try {
    const res = await fetchWithRetry(
      `${COMMONS_API}/divisions.json/search?${query}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((d: any) => ({
      divisionId: d.DivisionId,
      title: d.Title || "Untitled Division",
      date: String(d.Date || "").slice(0, 10),
      ayeCount: d.AyeCount ?? 0,
      noCount: d.NoCount ?? 0,
    }));
  } catch (error) {
    console.error("[ledger/divisions] search failed:", error);
    return [];
  }
}

/** How a specific member voted, newest first. */
export async function memberVotingRecord(
  memberId: number,
  take: number = 30,
): Promise<DivisionRecord[]> {
  try {
    const res = await fetchWithRetry(
      `${COMMONS_API}/divisions.json/membervoting?queryParameters.memberId=${memberId}&queryParameters.take=${take}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .filter((r: any) => r?.PublishedDivision)
      .map((r: any) => ({
        divisionId: r.PublishedDivision.DivisionId,
        title: r.PublishedDivision.Title || "Untitled Division",
        date: String(r.PublishedDivision.Date || "").slice(0, 10),
        ayeCount: r.PublishedDivision.AyeCount ?? 0,
        noCount: r.PublishedDivision.NoCount ?? 0,
        memberVotedAye: Boolean(r.MemberVotedAye),
      }));
  } catch (error) {
    console.error("[ledger/divisions] member voting failed:", error);
    return [];
  }
}
