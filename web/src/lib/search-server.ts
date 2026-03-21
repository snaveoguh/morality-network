import "server-only";

import { computeEntityHash } from "@/lib/entity";
import { getRecentPooterOriginals } from "@/lib/editorial-archive";
import { fetchAllProposals } from "@/lib/governance";
import { fetchMusicDiscovery } from "@/lib/music-discovery";
import type { DiscoveryRequest } from "@/lib/music-types";
import { DEFAULT_FEEDS, fetchAllFeeds } from "@/lib/rss";
import type { SearchGroup, SearchResult, SearchResponse, SearchSection } from "@/lib/search";
import { SEARCH_SECTION_META, SEARCH_SECTION_ORDER } from "@/lib/search";
import { fetchDailyVideos } from "@/lib/video";

interface SearchRecord extends SearchResult {
  searchable: string;
  sortTime: number;
}

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RESULTS_PER_SECTION = 5;

const DEFAULT_DISCOVERY_REQUEST: DiscoveryRequest = {
  vectors: {
    genreWeights: {},
    energyPreference: 0.5,
    eraPreference: {},
    explorationRate: 0.7,
  },
  seedGenres: [],
  seedArtists: [],
  excludeIds: [],
  limit: 36,
  mode: "explore",
};

let corpusCache: { records: SearchRecord[]; expiresAt: number } | null = null;
let corpusPromise: Promise<SearchRecord[]> | null = null;

function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function toSnippet(input: string | undefined, maxLength = 120): string {
  if (!input) return "";
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function toTimestamp(input: string | undefined): number {
  if (!input) return 0;
  const ts = new Date(input).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function buildSearchableText(result: SearchResult): string {
  return normalizeSearchText(
    [
      result.title,
      result.subtitle ?? "",
      result.source,
      result.category,
      ...(result.tags ?? []),
    ].join(" "),
  );
}

function scoreRecord(record: SearchRecord, query: string, terms: string[]): number {
  if (terms.length === 0) return 0;

  const phrase = normalizeSearchText(query);
  const title = normalizeSearchText(record.title);
  const subtitle = normalizeSearchText(record.subtitle ?? "");
  const source = normalizeSearchText(record.source);
  const category = normalizeSearchText(record.category);
  const tags = normalizeSearchText((record.tags ?? []).join(" "));
  const searchable = record.searchable;

  let score = 0;

  if (phrase.length >= 2 && title.includes(phrase)) score += 40;
  if (phrase.length >= 2 && subtitle.includes(phrase)) score += 24;
  if (phrase.length >= 2 && tags.includes(phrase)) score += 18;
  if (phrase.length >= 2 && searchable.includes(phrase)) score += 10;

  for (const term of terms) {
    if (!searchable.includes(term)) return -1;
    if (title.includes(term)) score += 14;
    if (subtitle.includes(term)) score += 9;
    if (tags.includes(term)) score += 8;
    if (source.includes(term)) score += 5;
    if (category.includes(term)) score += 4;
    score += 1;
  }

  const ageHours =
    record.sortTime > 0 ? Math.max(0, (Date.now() - record.sortTime) / 3_600_000) : 999;

  if (record.section === "breaking-news") {
    score += ageHours < 6 ? 12 : ageHours < 24 ? 7 : 2;
  } else if (record.section === "videos") {
    score += ageHours < 24 ? 8 : 2;
  } else if (record.section === "pooter-og") {
    score += ageHours < 72 ? 7 : 2;
  } else if (record.section === "music") {
    score += ageHours < 168 ? 4 : 1;
  }

  return score;
}

async function buildCorpus(): Promise<SearchRecord[]> {
  const [feedsResult, originalsResult, videosResult, musicResult, governanceResult] =
    await Promise.allSettled([
      fetchAllFeeds(DEFAULT_FEEDS),
      getRecentPooterOriginals(false, 120),
      fetchDailyVideos(32),
      fetchMusicDiscovery(DEFAULT_DISCOVERY_REQUEST),
      fetchAllProposals(),
    ]);

  const feedRecords: SearchRecord[] =
    feedsResult.status === "fulfilled"
      ? feedsResult.value.map((item) => ({
          id: item.id,
          section: "breaking-news" as const,
          kind: "rss" as const,
          title: item.title,
          subtitle: toSnippet(item.canonicalClaim || item.description, 132),
          source: item.source,
          category: item.category,
          href: `/article/${computeEntityHash(item.link)}`,
          external: false,
          pubDate: item.pubDate,
          tags: item.tags ?? [],
          sortTime: toTimestamp(item.pubDate),
          searchable: "",
        }))
      : [];

  const originalRecords: SearchRecord[] =
    originalsResult.status === "fulfilled"
      ? originalsResult.value.map((item) => ({
          id: item.hash,
          section: "pooter-og" as const,
          kind: "pooter-original" as const,
          title: item.dailyTitle || item.title,
          subtitle: toSnippet(item.subheadline, 128),
          source: item.source,
          category: item.isDailyEdition ? "Daily Edition" : item.category,
          href: `/article/${item.hash}`,
          external: false,
          pubDate: item.generatedAt,
          tags: item.tags ?? [],
          sortTime: toTimestamp(item.generatedAt),
          searchable: "",
        }))
      : [];

  const videoRecords: SearchRecord[] =
    videosResult.status === "fulfilled"
      ? videosResult.value.map((item) => ({
          id: item.id,
          section: "videos" as const,
          kind: "video" as const,
          title: item.title,
          subtitle: `${item.channel} · ${item.category}`,
          source: item.channel,
          category: item.category,
          href: item.url,
          external: true,
          pubDate: item.pubDate,
          tags: [item.category],
          sortTime: toTimestamp(item.pubDate),
          searchable: "",
        }))
      : [];

  const musicRecords: SearchRecord[] =
    musicResult.status === "fulfilled"
      ? musicResult.value.tracks.map((item) => ({
          id: item.id,
          section: "music" as const,
          kind: "music" as const,
          title: `${item.artist} — ${item.title}`,
          subtitle: [item.channel, item.genres.slice(0, 3).join(" · ")]
            .filter(Boolean)
            .join(" · "),
          source: item.artist,
          category: "Music Discovery",
          href: item.url,
          external: true,
          pubDate: item.pubDate,
          tags: item.genres,
          sortTime: toTimestamp(item.pubDate),
          searchable: "",
        }))
      : [];

  const governanceRecords: SearchRecord[] =
    governanceResult.status === "fulfilled"
      ? governanceResult.value.map((item) => ({
          id: item.id,
          section: "governance" as const,
          kind: "governance" as const,
          title: item.title,
          subtitle: toSnippet(item.body, 120),
          source: item.dao,
          category: item.status,
          href: item.id ? `/proposals/${encodeURIComponent(item.id)}` : item.link,
          external: !item.id,
          pubDate: new Date(item.startTime * 1000).toISOString(),
          tags: item.tags ?? [],
          sortTime: item.startTime * 1000,
          searchable: "",
        }))
      : [];

  const records = [
    ...feedRecords,
    ...originalRecords,
    ...videoRecords,
    ...musicRecords,
    ...governanceRecords,
  ].map((record) => ({
    ...record,
    searchable: buildSearchableText(record),
  }));

  return records;
}

async function getSearchCorpus(): Promise<SearchRecord[]> {
  const now = Date.now();
  if (corpusCache && corpusCache.expiresAt > now) {
    return corpusCache.records;
  }

  if (!corpusPromise) {
    corpusPromise = buildCorpus()
      .then((records) => {
        corpusCache = {
          records,
          expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        };
        return records;
      })
      .finally(() => {
        corpusPromise = null;
      });
  }

  return corpusPromise;
}

export async function searchSite(query: string): Promise<SearchResponse> {
  const trimmed = query.trim();
  const terms = splitTerms(trimmed);

  if (terms.length === 0 || trimmed.length < 2) {
    return { query: trimmed, total: 0, groups: [], results: [] };
  }

  const corpus = await getSearchCorpus();

  const scored = corpus
    .map((record) => ({ record, score: scoreRecord(record, trimmed, terms) }))
    .filter((entry) => entry.score >= 0);

  const groups: SearchGroup[] = SEARCH_SECTION_ORDER.map((section) => {
    const matches = scored
      .filter((entry) => entry.record.section === section)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.record.sortTime - a.record.sortTime;
      })
      .slice(0, MAX_RESULTS_PER_SECTION)
      .map((entry) => {
        const { searchable: _searchable, sortTime: _sortTime, ...result } = entry.record;
        return result;
      });

    return {
      section,
      label: SEARCH_SECTION_META[section].label,
      shortLabel: SEARCH_SECTION_META[section].shortLabel,
      results: matches,
      count: matches.length,
    };
  }).filter((group) => group.results.length > 0);

  const results = groups.flatMap((group) => group.results);

  return {
    query: trimmed,
    total: results.length,
    groups,
    results,
  };
}
