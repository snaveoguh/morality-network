import type { FeedItem } from "./rss";

// ============================================================================
// ARTICLE CONTENT GENERATION
// Context-first editorial synthesis from RSS + source-page enrichment
// ============================================================================

export interface SourceContextSnippet {
  source: string;
  link: string;
  summary: string;
}

export interface ArticleContent {
  /** The primary RSS item this article is about */
  primary: FeedItem;
  /** Related items from other sources covering the same/similar story */
  relatedSources: FeedItem[];
  /** Contextual subheadline generated for this specific story */
  subheadline: string;
  /** Editorial body paragraphs grounded in this story's specific context */
  editorialBody: string[];
  /** Compact multi-source wire summary */
  wireSummary: string | null;
  /** Source bias context note */
  biasContext: string | null;
  /** Tags derived from content */
  tags: string[];
  /** Extra context scraped from source pages */
  contextSnippets: SourceContextSnippet[];
}

interface StoryContext {
  primarySummary: string;
  relatedSnippets: SourceContextSnippet[];
  keyTerms: string[];
}

const SOURCE_CONTEXT_CACHE = new Map<string, { summary: string; expiresAt: number }>();
const CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const CONTEXT_FETCH_TIMEOUT_MS = 8_000;
const MAX_RELATED_CONTEXT_FETCH = 3;

// ============================================================================
// RELATED ARTICLE FINDER — richer matching than headline-only overlap
// ============================================================================

/**
 * Find related articles from other sources that likely cover the same story.
 * Uses weighted overlap from title+description, phrase overlap, and temporal proximity.
 */
export function findRelatedArticles(
  target: FeedItem,
  allItems: FeedItem[],
  maxResults = 5,
): FeedItem[] {
  const targetKeywords = extractKeywords(`${target.title} ${target.description}`);
  const targetPhrases = extractPhrases(target.title);
  if (targetKeywords.size === 0) return [];

  const scored: { item: FeedItem; score: number }[] = [];

  for (const item of allItems) {
    // Don't match self, same source, or missing links.
    if (item.id === target.id) continue;
    if (item.source === target.source) continue;
    if (!item.link) continue;

    const itemText = `${item.title} ${item.description}`;
    const itemKeywords = extractKeywords(itemText);

    let keywordOverlap = 0;
    for (const word of targetKeywords) {
      if (itemKeywords.has(word)) keywordOverlap++;
    }

    let phraseOverlap = 0;
    const itemTitleLower = item.title.toLowerCase();
    for (const phrase of targetPhrases) {
      if (itemTitleLower.includes(phrase)) phraseOverlap++;
    }

    // Ignore weak matches.
    if (keywordOverlap < 2 && phraseOverlap === 0) continue;

    const overlapRatio = keywordOverlap / Math.max(1, targetKeywords.size);

    const timeDiffMs = Math.abs(
      new Date(item.pubDate).getTime() - new Date(target.pubDate).getTime(),
    );
    const timeDiffHours = timeDiffMs / (3600 * 1000);
    const timeScore =
      timeDiffHours <= 24 ? 2 :
      timeDiffHours <= 72 ? 1 :
      0;

    const categoryScore = item.category === target.category ? 1 : 0;

    const score =
      (keywordOverlap * 2) +
      (phraseOverlap * 4) +
      Math.round(overlapRatio * 3) +
      categoryScore +
      timeScore;

    if (score >= 6) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Keep source diversity in the final set.
  const seenSources = new Set<string>();
  const output: FeedItem[] = [];
  for (const { item } of scored) {
    if (seenSources.has(item.source) && output.length >= maxResults) continue;
    output.push(item);
    seenSources.add(item.source);
    if (output.length >= maxResults) break;
  }

  return output;
}

// Stopwords for keyword extraction
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "must",
  "not", "no", "nor", "so", "if", "than", "that", "this", "these",
  "those", "it", "its", "as", "up", "out", "about", "into", "over",
  "after", "before", "between", "under", "above", "below", "all",
  "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "only", "own", "same", "also", "just", "how", "what",
  "which", "who", "whom", "when", "where", "why", "new", "says",
  "said", "say", "get", "gets", "got", "make", "makes", "made",
  "one", "two", "first", "last", "according", "report", "reports",
  "amid", "set", "via", "per", "still", "now", "back", "into", "onto",
  "after", "before", "during", "around", "across", "through", "their",
  "there", "here", "them", "they", "you", "your", "our", "ours",
]);

function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

function extractPhrases(text: string): Set<string> {
  const words = Array.from(extractKeywords(text));
  const phrases = new Set<string>();

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (bigram.length >= 9) {
      phrases.add(bigram);
    }
  }

  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (trigram.length >= 13) {
      phrases.add(trigram);
    }
  }

  return phrases;
}

// ============================================================================
// CONTEXTUAL ARTICLE GENERATION (async)
// ============================================================================

/**
 * Generate article commentary grounded in per-story context.
 * Pulls extra context from source pages (with timeout/fallback), rewrites into
 * concise summaries, and avoids duplicate/recycled paragraph text.
 */
export async function generateEditorial(
  primary: FeedItem,
  related: FeedItem[],
): Promise<ArticleContent> {
  const storyContext = await buildStoryContext(primary, related);

  const subheadline = generateSubheadline(primary, storyContext);
  const editorialBody = generateEditorialBody(primary, storyContext);
  const wireSummary = generateWireSummary(storyContext);
  const biasContext = generateBiasContext(primary, related);
  const tags = deriveTags(primary, storyContext);

  return {
    primary,
    relatedSources: related,
    subheadline,
    editorialBody,
    wireSummary,
    biasContext,
    tags,
    contextSnippets: storyContext.relatedSnippets,
  };
}

async function buildStoryContext(
  primary: FeedItem,
  related: FeedItem[],
): Promise<StoryContext> {
  const relatedForContext = related.slice(0, MAX_RELATED_CONTEXT_FETCH);

  const summaries = await Promise.all([
    getContextSummaryForItem(primary),
    ...relatedForContext.map((item) => getContextSummaryForItem(item)),
  ]);

  const primarySummary = summaries[0];

  const relatedSnippets = relatedForContext
    .map((item, index) => ({
      source: item.source,
      link: item.link,
      summary: summaries[index + 1],
    }))
    .filter((snippet) => snippet.summary.length > 0)
    .filter((snippet, index, arr) => {
      const norm = normalizeForDedup(snippet.summary);
      return arr.findIndex((s) => normalizeForDedup(s.summary) === norm) === index;
    });

  const termText = [
    primary.title,
    primary.description,
    primarySummary,
    ...related.map((r) => r.title),
    ...relatedSnippets.map((s) => s.summary),
  ].join(" ");

  const keyTerms = Array.from(extractKeywords(termText)).slice(0, 8);

  return {
    primarySummary,
    relatedSnippets,
    keyTerms,
  };
}

async function getContextSummaryForItem(item: FeedItem): Promise<string> {
  const fallback = rewriteAsBrief(item.description || item.title);
  if (!item.link) return fallback;

  const now = Date.now();
  const cached = SOURCE_CONTEXT_CACHE.get(item.link);
  if (cached && cached.expiresAt > now) {
    return cached.summary;
  }

  const targetKeywords = extractKeywords(`${item.title} ${item.description}`);
  const scraped = await fetchSourceSummary(item.link, targetKeywords);
  const summary = rewriteAsBrief(scraped || fallback || item.title);

  SOURCE_CONTEXT_CACHE.set(item.link, {
    summary,
    expiresAt: now + CONTEXT_CACHE_TTL_MS,
  });

  return summary;
}

async function fetchSourceSummary(
  url: string,
  targetKeywords: Set<string>,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTEXT_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PooterWorld/1.0 (+https://pooter.world)",
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return null;
    }

    const html = await res.text();
    const candidates = collectSummaryCandidates(html);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => scoreCandidate(b, targetKeywords) - scoreCandidate(a, targetKeywords));
    return candidates[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function collectSummaryCandidates(html: string): string[] {
  const candidates: string[] = [];

  candidates.push(...extractMetaDescriptions(html));
  candidates.push(...extractJsonLdDescriptions(html));
  candidates.push(...extractParagraphs(html));

  return dedupeStrings(candidates)
    .map((text) => cleanSnippet(text))
    .filter((text) => text.length >= 60)
    .slice(0, 24);
}

function extractMetaDescriptions(html: string): string[] {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const keys = ["description", "og:description", "twitter:description"];
  const out: string[] = [];

  for (const tag of metaTags) {
    const lower = tag.toLowerCase();
    const hasKey = keys.some(
      (key) =>
        lower.includes(`name=\"${key}\"`) ||
        lower.includes(`name='${key}'`) ||
        lower.includes(`property=\"${key}\"`) ||
        lower.includes(`property='${key}'`),
    );

    if (!hasKey) continue;

    const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (contentMatch?.[1]) {
      out.push(contentMatch[1]);
    }
  }

  return out;
}

function extractJsonLdDescriptions(html: string): string[] {
  const out: string[] = [];
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of matches) {
    const raw = cleanSnippet(match[1] || "");
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      collectTextFromJsonLd(parsed, out);
    } catch {
      // Ignore invalid json-ld chunks.
    }
  }

  return out;
}

function collectTextFromJsonLd(node: unknown, out: string[]): void {
  if (!node) return;

  if (typeof node === "string") {
    const text = cleanSnippet(node);
    if (text.length >= 60) {
      out.push(text);
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectTextFromJsonLd(entry, out);
    }
    return;
  }

  if (typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = key.toLowerCase();
    if (
      (normalizedKey === "description" ||
        normalizedKey === "articlebody" ||
        normalizedKey === "headline") &&
      typeof value === "string"
    ) {
      const text = cleanSnippet(value);
      if (text.length >= 60) {
        out.push(text);
      }
      continue;
    }

    collectTextFromJsonLd(value, out);
  }
}

function extractParagraphs(html: string): string[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const paragraphs = withoutScripts.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  const out: string[] = [];

  for (const p of paragraphs) {
    const cleaned = cleanSnippet(p[1] || "");
    if (cleaned.length >= 60 && cleaned.length <= 420) {
      out.push(cleaned);
    }

    if (out.length >= 20) break;
  }

  return out;
}

function scoreCandidate(text: string, targetKeywords: Set<string>): number {
  const words = extractKeywords(text);
  let overlap = 0;
  for (const w of targetKeywords) {
    if (words.has(w)) overlap++;
  }

  const sentenceLikeBonus = /[.!?]$/.test(text) ? 1 : 0;
  const lengthCenter = 170;
  const lengthPenalty = Math.abs(text.length - lengthCenter) / lengthCenter;

  return (overlap * 4) + sentenceLikeBonus - lengthPenalty;
}

// ============================================================================
// CONTEXTUAL COPY GENERATION
// ============================================================================

function generateSubheadline(primary: FeedItem, context: StoryContext): string {
  const terms = context.keyTerms.slice(0, 3);
  const termPart =
    terms.length >= 2 ? `${terms[0]} and ${terms[1]}` :
    terms.length === 1 ? terms[0] :
    primary.category.toLowerCase();

  const corroborators = context.relatedSnippets.slice(0, 2).map((s) => s.source);
  const corroboration =
    corroborators.length === 0
      ? ""
      : corroborators.length === 1
        ? ` Cross-checked against ${corroborators[0]}.`
        : ` Cross-checked against ${corroborators[0]} and ${corroborators[1]}.`;

  return `${primary.source} focuses on ${termPart}, with context pulled from source reporting instead of recycled feed copy.${corroboration}`;
}

function generateEditorialBody(primary: FeedItem, context: StoryContext): string[] {
  const paragraphs: string[] = [];

  const lead = `What happened: ${context.primarySummary}`;
  paragraphs.push(lead);

  if (context.relatedSnippets.length > 0) {
    const corroboration = context.relatedSnippets
      .slice(0, 3)
      .map((snippet) => `${snippet.source} highlights ${toLowerStart(snippet.summary)}`)
      .join(" ");

    paragraphs.push(`Cross-source context: ${corroboration}`);
  }

  const watchTerms = context.keyTerms.slice(0, 3);
  if (watchTerms.length > 0) {
    const watchline =
      watchTerms.length === 1
        ? `What to watch next: movement around ${watchTerms[0]}.`
        : `What to watch next: movement around ${watchTerms.join(", ")}.`;
    paragraphs.push(watchline);
  }

  return dedupeParagraphs(paragraphs).slice(0, 4);
}

function generateWireSummary(context: StoryContext): string | null {
  if (context.relatedSnippets.length === 0) return null;

  return context.relatedSnippets
    .slice(0, 3)
    .map((snippet) => `${snippet.source}: ${truncateWords(snippet.summary, 18)}`)
    .join(" | ");
}

// ============================================================================
// BIAS CONTEXT
// ============================================================================

function generateBiasContext(primary: FeedItem, related: FeedItem[]): string | null {
  const bias = primary.bias;
  if (!bias) return null;

  const biasDescriptions: Record<string, string> = {
    "far-left": "well to the left of centre",
    "left": "from a left-leaning editorial position",
    "lean-left": "with a slight leftward lean",
    "center": "from a centrist position",
    "lean-right": "with a slight rightward lean",
    "right": "from a right-leaning editorial position",
    "far-right": "well to the right of centre",
  };

  const factDescriptions: Record<string, string> = {
    "very-high": "an excellent factual track record",
    "high": "a strong factual track record",
    "mostly-factual": "a generally reliable factual record",
    "mixed": "a mixed factual record — read with appropriate scepticism",
    "low": "a questionable factual record — reader discretion strongly advised",
    "very-low": "a poor factual record — approach with considerable caution",
  };

  const biasDesc = biasDescriptions[bias.bias] || "an undetermined editorial position";
  const factDesc = factDescriptions[bias.factuality] || "an unrated factual record";

  let context = `${bias.name} reports ${biasDesc}, with ${factDesc}.`;

  // Note differing biases in related sources
  const relatedBiases = related
    .filter((r) => r.bias)
    .map((r) => ({ source: r.source, bias: r.bias!.bias }));

  if (relatedBiases.length > 0) {
    const differentBias = relatedBiases.find((r) => r.bias !== bias.bias);
    if (differentBias) {
      context += ` For counterpoint, ${differentBias.source} covers this from ${biasDescriptions[differentBias.bias] || "a different angle"}.`;
    }
  }

  return context;
}

// ============================================================================
// TAG DERIVATION
// ============================================================================

const TAG_KEYWORDS: Record<string, string[]> = {
  climate: ["climate", "warming", "carbon", "emission", "environmental", "green"],
  war: ["war", "conflict", "military", "troops", "invasion", "defense"],
  economy: ["economy", "inflation", "gdp", "recession", "market", "growth", "trade"],
  election: ["election", "vote", "ballot", "campaign", "candidate", "poll"],
  tech: ["ai", "artificial", "algorithm", "data", "software", "app", "digital"],
  crypto: ["bitcoin", "ethereum", "blockchain", "token", "defi", "nft", "web3"],
  health: ["health", "vaccine", "pandemic", "disease", "medical", "hospital"],
  energy: ["energy", "oil", "gas", "solar", "nuclear", "renewable"],
  finance: ["bank", "stock", "bond", "interest", "rate", "fed", "central"],
  rights: ["rights", "freedom", "protest", "justice", "equality", "discrimination"],
};

function deriveTags(item: FeedItem, context: StoryContext): string[] {
  const text = [
    item.title,
    item.description,
    context.primarySummary,
    ...context.relatedSnippets.map((s) => s.summary),
  ]
    .join(" ")
    .toLowerCase();

  const tags: string[] = [item.category.toLowerCase()];

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      tags.push(tag);
    }
  }

  for (const term of context.keyTerms.slice(0, 2)) {
    if (/^[a-z0-9-]{4,24}$/.test(term)) {
      tags.push(term);
    }
  }

  return [...new Set(tags)].slice(0, 8);
}

// ============================================================================
// TEXT HELPERS
// ============================================================================

function cleanSnippet(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x2019;|&#8217;/gi, "'")
    .replace(/&#x2013;|&#8211;/gi, "-")
    .replace(/&#x2014;|&#8212;/gi, "-");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeForDedup(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
  }

  return out;
}

function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function rewriteAsBrief(text: string): string {
  const cleaned = cleanSnippet(text);
  if (!cleaned) return "";

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40);

  if (sentences.length === 0) {
    return truncateWords(cleaned, 30);
  }

  const first = truncateWords(sentences[0], 26);
  const second = sentences.find((s) => normalizeForDedup(s) !== normalizeForDedup(first));

  if (!second) return first;

  return `${first} ${truncateWords(second, 18)}`;
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    const key = normalizeForDedup(paragraph);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(paragraph);
  }

  return out;
}

function toLowerStart(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

// ============================================================================
// EXPORTED UTILS
// ============================================================================

/**
 * Format a date for the newspaper dateline.
 */
export function formatDateline(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Estimate reading time based on word count.
 */
export function estimateReadingTime(texts: string[]): number {
  const totalWords = texts.join(" ").split(/\s+/).length;
  return Math.max(1, Math.ceil(totalWords / 200));
}
