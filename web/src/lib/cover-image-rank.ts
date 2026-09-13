/**
 * cover-image-rank.ts — rank RSS items as cover-photo candidates for a daily
 * edition by relevance to the story, not by feed timestamp.
 *
 * Why: the illustration cron used to take the newest feed item with an image
 * that downloaded. The Defiant stamps its pinned stories with the fetch time,
 * so a Revolut/Bridge banknote illustration was the cover of every edition
 * from #546 to #552 regardless of the headline (2026-09-13).
 */
import type { FeedItem } from "./rss";

export interface CoverCandidate {
  url: string;
  source: string;
  title: string;
  category?: string;
  tags?: string[];
  datedAtFetch?: boolean;
  /** true when the item was among the stories the edition was written from */
  fromEdition?: boolean;
}

export interface RankedCoverCandidate extends CoverCandidate {
  score: number;
  why: string[];
}

/** Feeds whose item images are illustrations / marketing art, not photography. */
export const MARKETING_ART_SOURCES = new Set(["the defiant", "cointelegraph", "decrypt"]);

/** Categories whose feeds carry news photography. */
const PHOTO_CATEGORIES = new Set(["World", "Politics", "Environment", "Business", "Science"]);

const STOPWORDS = new Set([
  "about", "after", "again", "against", "amid", "among", "because", "before", "being",
  "between", "could", "daily", "during", "edition", "every", "first", "from", "have",
  "here", "into", "just", "more", "most", "much", "must", "news", "only", "other",
  "over", "said", "says", "should", "since", "some", "still", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "under",
  "until", "very", "what", "when", "where", "which", "while", "will", "with", "would",
  "years", "year", "week", "today", "world", "report", "reports", "live", "latest",
]);

export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of (text || "").toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/'s$/, "");
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    out.add(w);
  }
  return out;
}

export interface EditionContext {
  headline: string;
  subheadline?: string | null;
  tags?: string[];
  body?: string[];
}

export function rankCoverCandidates(
  candidates: CoverCandidate[],
  edition: EditionContext,
): RankedCoverCandidate[] {
  const storyText = [edition.headline, edition.subheadline ?? "", ...(edition.body ?? []).slice(0, 2)].join(" ");
  const storyTokens = tokenize(storyText);
  const editionTags = new Set((edition.tags ?? []).map((t) => t.toLowerCase()));
  const cryptoEdition = editionTags.has("crypto") || /\b(crypto|bitcoin|ethereum|stablecoin|defi)\b/i.test(storyText);

  const ranked = candidates.map((c, index): RankedCoverCandidate => {
    let score = 0;
    const why: string[] = [];

    const titleOverlap = [...tokenize(c.title)].filter((w) => storyTokens.has(w)).length;
    if (titleOverlap) { score += titleOverlap * 2; why.push(`title overlap ${titleOverlap}`); }

    const tagOverlap = (c.tags ?? []).filter((t) => editionTags.has(t.toLowerCase())).length;
    if (tagOverlap) { score += tagOverlap * 3; why.push(`tag overlap ${tagOverlap}`); }

    if (c.fromEdition) { score += 2; why.push("in edition sources"); }
    if (c.category && PHOTO_CATEGORIES.has(c.category)) { score += 1; why.push(`photo category ${c.category}`); }
    if (c.category === "Crypto" && !cryptoEdition) { score -= 4; why.push("crypto feed, non-crypto edition"); }
    if (MARKETING_ART_SOURCES.has(c.source.toLowerCase())) { score -= 5; why.push("marketing-art source"); }
    if (c.datedAtFetch) { score -= 3; why.push("fetch-stamped date"); }

    return { ...c, score: score - index * 0.001, why };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

export function feedItemToCandidate(item: FeedItem, fromEdition: boolean): CoverCandidate | null {
  if (!item.imageUrl) return null;
  return {
    url: item.imageUrl,
    source: item.source,
    title: item.title,
    category: item.category,
    tags: item.tags,
    datedAtFetch: item.datedAtFetch,
    fromEdition,
  };
}
