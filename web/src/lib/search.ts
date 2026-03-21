export type SearchSection =
  | "breaking-news"
  | "pooter-og"
  | "videos"
  | "music"
  | "governance";

export type SearchResultKind =
  | "rss"
  | "pooter-original"
  | "video"
  | "music"
  | "governance";

export interface SearchResult {
  id: string;
  section: SearchSection;
  kind: SearchResultKind;
  title: string;
  subtitle?: string;
  source: string;
  category: string;
  href: string;
  external?: boolean;
  pubDate?: string;
  tags?: string[];
}

export interface SearchGroup {
  section: SearchSection;
  label: string;
  shortLabel: string;
  results: SearchResult[];
  count: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  groups: SearchGroup[];
  results: SearchResult[];
}

export const SEARCH_SECTION_META: Record<
  SearchSection,
  { label: string; shortLabel: string }
> = {
  "breaking-news": { label: "Breaking News", shortLabel: "News" },
  "pooter-og": { label: "Pooter OG", shortLabel: "OG" },
  videos: { label: "Videos", shortLabel: "Video" },
  music: { label: "Music", shortLabel: "Music" },
  governance: { label: "Governance", shortLabel: "Gov" },
};

export const SEARCH_SECTION_ORDER: SearchSection[] = [
  "breaking-news",
  "pooter-og",
  "videos",
  "music",
  "governance",
];
