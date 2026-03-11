// UK Parliament — House of Commons + House of Lords division votes
// Free APIs, no auth required
// Commons: https://commonsvotes-api.parliament.uk
// Lords: https://lordsvotes-api.parliament.uk

// ============================================================================
// FETCH WITH RETRY + TIMEOUT — Exponential backoff with AbortController
// ============================================================================

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds

async function fetchWithRetry(
  url: string,
  options?: RequestInit & { next?: { revalidate: number } },
  maxRetries: number = 3
): Promise<Response> {
  const backoffMs = [500, 1000, 2000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || !RETRYABLE_STATUS_CODES.has(res.status)) {
        return res;
      }

      // Retryable HTTP status — fall through to retry logic
      if (attempt < maxRetries) {
        const delay = backoffMs[attempt] || 2000;
        console.warn(
          `[Parliament fetchWithRetry] ${url} returned ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        return res; // Return the failed response after all retries exhausted
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt < maxRetries) {
        const delay = backoffMs[attempt] || 2000;
        const reason =
          error instanceof DOMException && error.name === "AbortError"
            ? "request timed out"
            : error instanceof Error
              ? error.message
              : String(error);
        console.warn(
          `[Parliament fetchWithRetry] ${url} failed (${reason}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error; // Re-throw after all retries exhausted
      }
    }
  }

  // Should not reach here, but TypeScript needs a return
  throw new Error(`[Parliament fetchWithRetry] All ${maxRetries} retries exhausted for ${url}`);
}

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
    const res = await fetchWithRetry(
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
    console.error("[UK Parliament] Failed to fetch Commons divisions:", error);
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
    const res = await fetchWithRetry(
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
    console.error("[UK Parliament] Failed to fetch Lords divisions:", error);
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
    const res = await fetchWithRetry(`${COMMONS_API}/division/${divisionId}.json`, {
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
    console.error("[UK Parliament] Failed to fetch Commons division detail:", error);
    return null;
  }
}

export async function fetchLordsDivisionById(
  divisionId: number
): Promise<ParliamentDivision | null> {
  try {
    const res = await fetchWithRetry(`${LORDS_API}/${divisionId}`, {
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
    console.error("[UK Parliament] Failed to fetch Lords division detail:", error);
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
