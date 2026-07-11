// Hansard API client for the Claim Ledger — PMQs vertical slice.
// hansard-api.parliament.uk — free, no auth. Sibling of lib/parliament.ts
// (division votes); this module fetches debate TEXT.
//
// PMQs lives in Hansard as the Commons "Engagements" debate section
// (HRSTag hs_8Question) on sitting Wednesdays.

import { fetchWithRetry } from "../fetch-utils";
import type {
  HansardContribution,
  HansardDebate,
  LedgerSpeaker,
} from "./types";

const HANSARD_API = "https://hansard-api.parliament.uk";
const HANSARD_WEB = "https://hansard.parliament.uk";

// Party codes as printed by Hansard after the constituency, e.g. "(Lab)".
// Used to tell a party parenthetical apart from a name parenthetical in
// attributions like "The Deputy Prime Minister (Mr David Lammy)".
const PARTY_CODES = new Set([
  "Con",
  "Lab",
  "Lab/Co-op",
  "LD",
  "SNP",
  "DUP",
  "Green",
  "PC",
  "Reform",
  "Ind",
  "Alliance",
  "SDLP",
  "UUP",
  "TUV",
  "WPB",
]);

// Chair contributions are procedural, never claims. Older records style the
// chair as "Mr. Deputy Speaker (Sir Alan Haselhurst)" — allow the period and
// the name parenthetical.
const CHAIR_ATTRIBUTIONS = /^(mr\.?|madam)? ?(deputy )?speaker(\s*\([^)]*\))?$/i;

interface HansardSearchResult {
  DebateSectionExtId: string;
  SittingDate: string;
  House: string;
  Title: string;
}

interface HansardDebateItem {
  ItemType: string;
  MemberId: number | null;
  AttributedTo: string | null;
  ExternalId: string | null;
  OrderInSection: number;
  HRSTag: string | null;
  Value: string | null;
}

interface HansardDebatePayload {
  Overview: {
    ExtId: string;
    Title: string;
    Date: string;
    House: string;
  };
  Items: HansardDebateItem[];
}

/** Strip Hansard's inline markup (Question/QuestionText tags, column spans). */
export function stripHansardMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^\s*Q\d+\.\s*/, "") // "Q1." question-number prefix
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a Hansard attribution string into a speaker.
 * Forms seen in the wild:
 *   "Paul Holmes (Hamble Valley) (Con)"
 *   "Florence Eshalomi (Vauxhall and Camberwell Green) (Lab/Co-op)"
 *   "The Deputy Prime Minister (Mr David Lammy)"
 *   "The Prime Minister"
 *   "Paul Holmes"   (follow-up turns drop constituency/party)
 */
export function parseAttribution(
  attributedTo: string,
  memberId: number | null,
): LedgerSpeaker {
  const parens = [...attributedTo.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const base = attributedTo.replace(/\s*\([^)]*\)/g, "").trim();

  let party: string | null = null;
  let constituency: string | null = null;
  let name = base;

  for (const value of parens) {
    if (PARTY_CODES.has(value)) {
      party = value;
    } else if (/^(mr|mrs|ms|miss|dr|sir|dame) /i.test(value)) {
      // Officeholder form: the parenthetical is the person's name.
      name = value.replace(/^(mr|mrs|ms|miss|dr|sir|dame) /i, "").trim();
    } else if (!constituency) {
      constituency = value;
    }
  }

  return { memberId, name, party, constituency };
}

function slugify(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9]+/g, "")
      .trim() || "Debate"
  );
}

export function debateWebUrl(
  house: string,
  dateIso: string,
  extId: string,
  title: string,
): string {
  return `${HANSARD_WEB}/${house}/${dateIso}/debates/${extId}/${slugify(title)}`;
}

export function contributionWebUrl(
  debateUrl: string,
  contributionExternalId: string,
): string {
  return `${debateUrl}#contribution-${contributionExternalId}`;
}

/**
 * Find recent PMQs ("Engagements") debate sections, newest first.
 * `lookbackDays` bounds the search window (PMQs is weekly in sitting terms;
 * 45 days survives recess gaps).
 */
export async function findRecentPmqsSittings(
  lookbackDays: number = 45,
): Promise<Array<{ extId: string; date: string }>> {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const res = await fetchWithRetry(
      `${HANSARD_API}/search/debates.json?queryParameters.searchTerm=Engagements&queryParameters.house=Commons&queryParameters.startDate=${fmt(start)}&queryParameters.endDate=${fmt(end)}&queryParameters.orderBy=SittingDateDesc`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: HansardSearchResult[] = Array.isArray(data?.Results)
      ? data.Results
      : [];

    return results
      .filter(
        (r) =>
          r?.DebateSectionExtId &&
          r.Title === "Engagements" &&
          r.House === "Commons",
      )
      .map((r) => ({
        extId: r.DebateSectionExtId,
        date: r.SittingDate.slice(0, 10),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("[ledger/hansard] PMQs search failed:", error);
    return [];
  }
}

/** Fetch a debate section with all contributions, markup stripped. */
export async function fetchDebate(extId: string): Promise<HansardDebate | null> {
  try {
    const res = await fetchWithRetry(
      `${HANSARD_API}/debates/debate/${extId}.json`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as HansardDebatePayload;
    if (!payload?.Overview?.ExtId) return null;

    const house = payload.Overview.House === "Lords" ? "Lords" : "Commons";
    const date = payload.Overview.Date.slice(0, 10);
    const title = payload.Overview.Title || "Debate";
    const sourceUrl = debateWebUrl(house, date, payload.Overview.ExtId, title);

    const contributions: HansardContribution[] = [];
    for (const item of payload.Items || []) {
      if (item.ItemType !== "Contribution") continue;
      if (!item.ExternalId || !item.AttributedTo) continue;
      if (CHAIR_ATTRIBUTIONS.test(item.AttributedTo.trim())) continue;

      const text = stripHansardMarkup(item.Value || "");
      if (text.length < 40) continue; // procedural one-liners carry no claims

      contributions.push({
        externalId: item.ExternalId,
        speaker: parseAttribution(item.AttributedTo, item.MemberId),
        text,
        orderInSection: item.OrderInSection,
        sourceUrl: contributionWebUrl(sourceUrl, item.ExternalId),
      });
    }

    contributions.sort((a, b) => a.orderInSection - b.orderInSection);

    return { extId: payload.Overview.ExtId, title, house, date, sourceUrl, contributions };
  } catch (error) {
    console.error("[ledger/hansard] debate fetch failed:", error);
    return null;
  }
}

/**
 * Budget speeches: Hansard titles them "Financial Statement" (older) or
 * "Financial Statement and Budget Report" (2023+). One per fiscal event,
 * 2010 → now ≈ 20 sittings. Oldest first so backfill compounds forward.
 */
export async function findBudgetSittings(
  fromYear: number = 2010,
): Promise<Array<{ extId: string; date: string }>> {
  try {
    const res = await fetchWithRetry(
      `${HANSARD_API}/search/debates.json?queryParameters.searchTerm=${encodeURIComponent("Financial Statement")}&queryParameters.house=Commons&queryParameters.startDate=${fromYear}-01-01&queryParameters.endDate=${new Date().toISOString().slice(0, 10)}&queryParameters.orderBy=SittingDateDesc`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86_400 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: HansardSearchResult[] = Array.isArray(data?.Results)
      ? data.Results
      : [];
    return results
      .filter(
        (r) =>
          r?.DebateSectionExtId &&
          r.House === "Commons" &&
          /^Financial Statement/i.test((r.Title || "").trim()),
      )
      .map((r) => ({
        extId: r.DebateSectionExtId,
        date: r.SittingDate.slice(0, 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error("[ledger/hansard] budget search failed:", error);
    return [];
  }
}

/** Convenience: the most recent PMQs session with full text. */
export async function fetchLatestPmqs(): Promise<HansardDebate | null> {
  const sittings = await findRecentPmqsSittings();
  for (const sitting of sittings) {
    const debate = await fetchDebate(sitting.extId);
    if (debate && debate.contributions.length > 0) return debate;
  }
  return null;
}
