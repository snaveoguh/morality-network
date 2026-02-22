// UK Parliament — House of Commons + House of Lords division votes
// Free APIs, no auth required
// Commons: https://commonsvotes-api.parliament.uk
// Lords: https://lordsvotes-api.parliament.uk

// ============================================================================
// TYPES
// ============================================================================

export interface ParliamentDivision {
  id: number;
  title: string;
  date: string; // ISO date
  house: "Commons" | "Lords";
  ayeCount: number;
  noeCount: number;
  didNotVoteCount: number;
  abstentionCount: number;
  // Detail fields (populated on single-division fetch)
  ayeMembers?: MPVote[];
  noeMembers?: MPVote[];
}

export interface MPVote {
  memberId: number;
  name: string;
  party: string;
  votedAye: boolean;
}

// ============================================================================
// COMMONS — House of Commons divisions
// ============================================================================

const COMMONS_API = "https://commonsvotes-api.parliament.uk/data";

export async function fetchCommonsDivisions(
  count: number = 20
): Promise<ParliamentDivision[]> {
  try {
    const res = await fetch(
      `${COMMONS_API}/divisions.json/search?queryParameters.take=${count}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data || []).map((d: any) => ({
      id: d.DivisionId,
      title: d.Title || "Untitled Division",
      date: d.Date,
      house: "Commons" as const,
      ayeCount: d.AyeCount ?? 0,
      noeCount: d.NoCount ?? 0,
      didNotVoteCount: d.DidNotVoteCount ?? 0,
      abstentionCount: 0,
    }));
  } catch (error) {
    console.error("Failed to fetch Commons divisions:", error);
    return [];
  }
}

// ============================================================================
// LORDS — House of Lords divisions
// ============================================================================

const LORDS_API = "https://lordsvotes-api.parliament.uk/data/Divisions";

export async function fetchLordsDivisions(
  count: number = 20
): Promise<ParliamentDivision[]> {
  try {
    const res = await fetch(
      `${LORDS_API}/search?count=${count}&SortBy=DateDesc`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data || []).map((d: any) => ({
      id: d.DivisionId,
      title: d.Title || "Untitled Division",
      date: d.Date,
      house: "Lords" as const,
      ayeCount: d.AuthorityCount ?? d.ContentCount ?? 0,
      noeCount: d.NotAuthorityCount ?? d.NotContentCount ?? 0,
      didNotVoteCount: d.DidNotVoteCount ?? 0,
      abstentionCount: 0,
    }));
  } catch (error) {
    console.error("Failed to fetch Lords divisions:", error);
    return [];
  }
}

// ============================================================================
// DETAIL — Single division with member votes
// ============================================================================

export async function fetchCommonsDivisionById(
  divisionId: number
): Promise<ParliamentDivision | null> {
  try {
    const res = await fetch(`${COMMONS_API}/division/${divisionId}.json`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const d = await res.json();

    const ayeMembers: MPVote[] = (d.Ayes || []).map((m: any) => ({
      memberId: m.MemberId,
      name: m.Name || "Unknown",
      party: m.Party || "Unknown",
      votedAye: true,
    }));

    const noeMembers: MPVote[] = (d.Noes || []).map((m: any) => ({
      memberId: m.MemberId,
      name: m.Name || "Unknown",
      party: m.Party || "Unknown",
      votedAye: false,
    }));

    return {
      id: d.DivisionId,
      title: d.Title || "Untitled Division",
      date: d.Date,
      house: "Commons",
      ayeCount: d.AyeCount ?? ayeMembers.length,
      noeCount: d.NoCount ?? noeMembers.length,
      didNotVoteCount: d.DidNotVoteCount ?? 0,
      abstentionCount: 0,
      ayeMembers,
      noeMembers,
    };
  } catch (error) {
    console.error("Failed to fetch Commons division detail:", error);
    return null;
  }
}

export async function fetchLordsDivisionById(
  divisionId: number
): Promise<ParliamentDivision | null> {
  try {
    const res = await fetch(`${LORDS_API}/${divisionId}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const d = await res.json();

    const ayeMembers: MPVote[] = (d.Contents || d.Ayes || []).map((m: any) => ({
      memberId: m.MemberId,
      name: m.Name || "Unknown",
      party: m.Party || "Unknown",
      votedAye: true,
    }));

    const noeMembers: MPVote[] = (d.NotContents || d.Noes || []).map(
      (m: any) => ({
        memberId: m.MemberId,
        name: m.Name || "Unknown",
        party: m.Party || "Unknown",
        votedAye: false,
      })
    );

    return {
      id: d.DivisionId,
      title: d.Title || "Untitled Division",
      date: d.Date,
      house: "Lords",
      ayeCount: d.AuthorityCount ?? d.ContentCount ?? ayeMembers.length,
      noeCount:
        d.NotAuthorityCount ?? d.NotContentCount ?? noeMembers.length,
      didNotVoteCount: d.DidNotVoteCount ?? 0,
      abstentionCount: 0,
      ayeMembers,
      noeMembers,
    };
  } catch (error) {
    console.error("Failed to fetch Lords division detail:", error);
    return null;
  }
}

// ============================================================================
// AGGREGATOR
// ============================================================================

export async function fetchAllDivisions(): Promise<ParliamentDivision[]> {
  const [commons, lords] = await Promise.allSettled([
    fetchCommonsDivisions(10),
    fetchLordsDivisions(5),
  ]);

  const all: ParliamentDivision[] = [];
  if (commons.status === "fulfilled") all.push(...commons.value);
  if (lords.status === "fulfilled") all.push(...lords.value);

  // Sort newest first
  all.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return all;
}
