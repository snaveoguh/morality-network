import type { FeedItem } from "./rss";
import {
  buildAgentResearchPack,
  type AgentResearchPack,
} from "./agent-swarm";

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
  /** Canonical claim sentence extracted from the story */
  claim: string;
  /** Related items from other sources covering the same/similar story */
  relatedSources: FeedItem[];
  /** Contextual subheadline generated for this specific story */
  subheadline: string;
  /** English companion line for non-English stories */
  subheadlineEnglish?: string | null;
  /** Editorial body paragraphs grounded in this story's specific context */
  editorialBody: string[];
  /** English companion paragraphs for non-English stories */
  editorialBodyEnglish?: string[];
  /** Compact multi-source wire summary */
  wireSummary: string | null;
  /** Source bias context note */
  biasContext: string | null;
  /** Tags derived from content */
  tags: string[];
  /** Extra context scraped from source pages */
  contextSnippets: SourceContextSnippet[];
  /** Structured swarm output: evidence, claims, contradiction flags */
  agentResearch: AgentResearchPack;
}

interface StoryContext {
  primarySummary: string;
  relatedSnippets: SourceContextSnippet[];
  keyTerms: string[];
}

interface LanguageProfile {
  isNonLatinHeavy: boolean;
  isJapanese: boolean;
  isCjk: boolean;
}

const SOURCE_CONTEXT_CACHE = new Map<string, { summary: string; expiresAt: number }>();
const CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const CONTEXT_FETCH_TIMEOUT_MS = 8_000;
const MAX_RELATED_CONTEXT_FETCH = 3;
const ENGLISH_TRANSLATION_CACHE = new Map<string, { text: string; expiresAt: number }>();
const TRANSLATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TRANSLATION_TIMEOUT_MS = 5_000;

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
  const targetTitleKeywords = extractKeywords(target.title);
  const targetSignalKeywords = extractSignalKeywords(target.title);
  const targetPhrases = extractPhrases(target.title);
  const targetTags = new Set((target.tags || []).map((tag) => tag.toLowerCase()));

  if (targetKeywords.size === 0 || targetTitleKeywords.size === 0) return [];

  const scored: { item: FeedItem; score: number }[] = [];

  for (const item of allItems) {
    // Don't match self, same source, or missing links.
    if (item.id === target.id) continue;
    if (item.source === target.source) continue;
    if (!item.link) continue;

    const itemText = `${item.title} ${item.description}`;
    const itemKeywords = extractKeywords(itemText);
    const itemTitleKeywords = extractKeywords(item.title);
    const itemSignalKeywords = extractSignalKeywords(item.title);
    const itemTags = new Set((item.tags || []).map((tag) => tag.toLowerCase()));

    const keywordOverlap = countOverlap(targetKeywords, itemKeywords);
    const titleKeywordOverlap = countOverlap(targetTitleKeywords, itemTitleKeywords);
    const signalOverlap = countOverlap(targetSignalKeywords, itemSignalKeywords);
    const sharedTagCount = countOverlap(targetTags, itemTags);

    let phraseOverlap = 0;
    const itemTitleLower = item.title.toLowerCase();
    for (const phrase of targetPhrases) {
      if (itemTitleLower.includes(phrase)) phraseOverlap++;
    }

    const hasStrongAnchor = signalOverlap > 0 || phraseOverlap > 0 || titleKeywordOverlap >= 2;
    if (!hasStrongAnchor) continue;

    if (targetSignalKeywords.size > 0 && signalOverlap === 0 && phraseOverlap === 0) {
      continue;
    }

    if (targetTags.size > 0 && sharedTagCount === 0 && signalOverlap === 0 && phraseOverlap === 0) {
      continue;
    }

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
      (signalOverlap * 6) +
      (titleKeywordOverlap * 3) +
      (phraseOverlap * 5) +
      (sharedTagCount * 2) +
      keywordOverlap +
      Math.round(overlapRatio * 2) +
      categoryScore +
      timeScore;

    const minScore = signalOverlap > 0 || phraseOverlap > 0 ? 9 : 11;
    if (score >= minScore) {
      scored.push({ item, score });
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score < 9) return [];

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
  "there", "here", "them", "they", "you", "your", "our", "ours", "going",
  "his", "her", "hers", "him", "she", "he", "its", "itself", "theirs",
  "year", "years", "month", "months", "week", "weeks", "day", "days",
  "today", "yesterday", "tomorrow", "breaking", "latest", "live", "update",
  "updates", "story", "stories", "video", "photos", "images", "opinion",
]);

const SHORT_SIGNAL_TERMS = new Set([
  "ai",
  "uk",
  "us",
  "eu",
  "nft",
  "dao",
  "btc",
  "eth",
  "fed",
  "sec",
  "ipo",
  "nato",
  "opec",
  "iran",
  "gaza",
  "china",
  "trump",
]);

const LOW_SIGNAL_TERMS = new Set([
  "people",
  "person",
  "official",
  "officials",
  "workers",
  "work",
  "global",
  "world",
  "country",
  "countries",
  "government",
  "governments",
  "public",
  "private",
  "issue",
  "issues",
  "event",
  "events",
  "thing",
  "things",
  "matter",
  "matters",
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

function extractSignalKeywords(text: string): Set<string> {
  const base = extractKeywords(text);
  const out = new Set<string>();

  for (const word of base) {
    if (LOW_SIGNAL_TERMS.has(word)) continue;
    if (word.length >= 4 || SHORT_SIGNAL_TERMS.has(word)) {
      out.add(word);
    }
  }

  return out;
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const value of a) {
    if (b.has(value)) overlap++;
  }
  return overlap;
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
  const lang = detectLanguageProfile(primary, storyContext);
  const claim = extractClaim(primary, storyContext);

  const subheadline = generateSubheadline(primary, storyContext, lang);
  const editorialBody = generateEditorialBody(primary, storyContext, lang);
  const wireSummary = generateWireSummary(storyContext);
  const biasContext = generateBiasContext(primary, related);
  const tags = deriveTags(primary, storyContext);

  const relatedSummaryByLink = Object.fromEntries(
    storyContext.relatedSnippets.map((snippet) => [snippet.link, snippet.summary]),
  );
  const agentResearch = buildAgentResearchPack({
    primary,
    related,
    fallbackClaim: claim,
    primarySummary: storyContext.primarySummary,
    relatedSummaryByLink,
  });

  let subheadlineEnglish: string | null = null;
  let editorialBodyEnglish: string[] | undefined;

  if (lang.isNonLatinHeavy) {
    const translated = await translateBlocksToEnglish([subheadline, ...editorialBody]);
    subheadlineEnglish = translated[0] || null;
    editorialBodyEnglish = translated.slice(1);
  }

  return {
    primary,
    claim,
    relatedSources: related,
    subheadline,
    subheadlineEnglish,
    editorialBody,
    editorialBodyEnglish,
    wireSummary,
    biasContext,
    tags,
    contextSnippets: storyContext.relatedSnippets,
    agentResearch,
  };
}

async function buildStoryContext(
  primary: FeedItem,
  related: FeedItem[],
): Promise<StoryContext> {
  const relatedForContext = related.slice(0, MAX_RELATED_CONTEXT_FETCH);
  const primaryAnchorTerms = extractSignalKeywords(primary.title);

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
    .filter((snippet) => isContextSnippetRelevant(snippet.summary, primaryAnchorTerms))
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

  const keyTerms = extractTopTerms(termText, 8);

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

function isContextSnippetRelevant(summary: string, primaryAnchorTerms: Set<string>): boolean {
  if (primaryAnchorTerms.size === 0) return true;

  const summarySignalTerms = extractSignalKeywords(summary);
  if (countOverlap(summarySignalTerms, primaryAnchorTerms) >= 1) {
    return true;
  }

  const summaryLooseTerms = extractKeywords(summary);
  return countOverlap(summaryLooseTerms, primaryAnchorTerms) >= 2;
}

// ============================================================================
// CONTEXTUAL COPY GENERATION
// ============================================================================

function generateSubheadline(
  primary: FeedItem,
  context: StoryContext,
  lang: LanguageProfile,
): string {
  if (lang.isNonLatinHeavy) {
    return truncateWords(context.primarySummary, lang.isCjk ? 36 : 20);
  }

  const titleTerms = extractTopTerms(primary.title, 4);
  const terms = (titleTerms.length > 0 ? titleTerms : context.keyTerms).slice(0, 3);
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

function extractClaim(primary: FeedItem, context: StoryContext): string {
  const cleanedTitle = cleanSnippet(primary.title);
  const cleanedSummary = cleanSnippet(context.primarySummary);
  let claim = cleanedTitle.length >= 16 ? cleanedTitle : cleanedSummary;
  if (!claim) claim = cleanedTitle || cleanedSummary || "Claim unavailable";

  // Remove trailing publication suffixes like " - Reuters" that are common in feeds.
  claim = claim.replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "").trim();
  claim = claim.replace(/^["'“”]+|["'“”]+$/g, "").trim();

  if (!claim) return "Claim unavailable.";

  if (containsCjk(claim)) {
    if (!/[。！？]$/.test(claim)) claim += "。";
  } else if (!/[.!?]$/.test(claim)) {
    claim += ".";
  }

  return claim;
}

function generateEditorialBody(
  primary: FeedItem,
  context: StoryContext,
  lang: LanguageProfile,
): string[] {
  const paragraphs: string[] = [];

  if (lang.isNonLatinHeavy) {
    paragraphs.push(context.primarySummary);

    if (context.relatedSnippets.length > 0) {
      const related = context.relatedSnippets
        .slice(0, 2)
        .map((snippet) => `${snippet.source}: ${snippet.summary}`)
        .join(" / ");
      paragraphs.push(related);
    }

    return dedupeParagraphs(paragraphs).slice(0, 3);
  }

  const lead = `What happened: ${context.primarySummary}`;
  paragraphs.push(lead);

  if (context.relatedSnippets.length > 0) {
    const corroboration = context.relatedSnippets
      .slice(0, 3)
      .map((snippet) => `${snippet.source} highlights ${toLowerStart(snippet.summary)}`)
      .join(" ");

    paragraphs.push(`Cross-source context: ${corroboration}`);
  }

  const titleWatchTerms = extractTopTerms(primary.title, 3);
  const watchTerms = (titleWatchTerms.length > 0 ? titleWatchTerms : context.keyTerms).slice(0, 2);
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
  war: ["war", "conflict", "military", "troops", "invasion"],
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
    if (keywords.some((kw) => containsKeyword(text, kw))) {
      tags.push(tag);
    }
  }

  const titleTerms = extractSignalKeywords(item.title);
  for (const term of context.keyTerms.slice(0, 2)) {
    if (/^[a-z0-9-]{4,24}$/.test(term)) {
      if (titleTerms.has(term)) {
        tags.push(term);
      }
    }
  }

  return [...new Set(tags)].slice(0, 8);
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  if (keyword.includes(" ")) {
    return text.includes(keyword);
  }
  const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
  return pattern.test(text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    // Keep Unicode letters/numbers so CJK and other non-Latin text can dedupe safely.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
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
  const second = sentences.find((s) => !isNearDuplicateSentence(s, first));

  if (!second) return first;

  return `${first} ${truncateWords(second, 18)}`;
}

function isNearDuplicateSentence(a: string, b: string): boolean {
  const na = normalizeForDedup(a);
  const nb = normalizeForDedup(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.startsWith(nb.slice(0, 80)) || nb.startsWith(na.slice(0, 80))) return true;

  const aWords = new Set(na.split(" ").filter(Boolean));
  const bWords = new Set(nb.split(" ").filter(Boolean));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }
  const minSize = Math.max(1, Math.min(aWords.size, bWords.size));
  return overlap / minSize >= 0.8;
}

function extractTopTerms(text: string, maxTerms: number): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => {
      if (!w) return false;
      if (STOP_WORDS.has(w) || LOW_SIGNAL_TERMS.has(w)) return false;
      if (w.length >= 4) return true;
      return SHORT_SIGNAL_TERMS.has(w);
    });

  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].length - a[0].length;
    })
    .slice(0, maxTerms)
    .map(([word]) => word);
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
  if (containsCjk(text)) {
    if (text.length <= maxWords) return text;
    return `${text.slice(0, maxWords)}...`;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function detectLanguageProfile(primary: FeedItem, context: StoryContext): LanguageProfile {
  const text = [primary.title, primary.description, context.primarySummary].join(" ");
  const latinMatches = text.match(/[A-Za-z]/g) || [];
  const nonLatinMatches = text.match(/[^\x00-\x7F]/g) || [];
  const japaneseMatches = text.match(/[\u3040-\u30FF\u31F0-\u31FF]/g) || [];
  const cjkMatches = text.match(/[\u4E00-\u9FFF]/g) || [];

  const latinCount = latinMatches.length;
  const nonLatinCount = nonLatinMatches.length;

  return {
    isNonLatinHeavy: nonLatinCount > latinCount * 1.2 && nonLatinCount > 20,
    isJapanese: japaneseMatches.length > 4,
    isCjk: cjkMatches.length > 4 || japaneseMatches.length > 4,
  };
}

function containsCjk(text: string): boolean {
  return /[\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FFF]/.test(text);
}

async function translateBlocksToEnglish(texts: string[]): Promise<string[]> {
  const translated = await Promise.all(texts.map((text) => translateToEnglish(text)));
  return translated.map((value, index) => value || texts[index]);
}

async function translateToEnglish(input: string): Promise<string | null> {
  const text = cleanSnippet(input);
  if (!text) return null;
  if (!/[^\x00-\x7F]/.test(text)) return text;

  const now = Date.now();
  const cached = ENGLISH_TRANSLATION_CACHE.get(text);
  if (cached && cached.expiresAt > now) {
    return cached.text;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);

  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", "en");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text.slice(0, 1800));

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "PooterWorld/1.0 (+https://pooter.world)",
      },
    });

    if (!res.ok) return null;

    const data = await res.json() as unknown;
    const translated = parseGoogleTranslatePayload(data);
    if (!translated) return null;

    ENGLISH_TRANSLATION_CACHE.set(text, {
      text: translated,
      expiresAt: now + TRANSLATION_CACHE_TTL_MS,
    });

    return translated;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGoogleTranslatePayload(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;

  const chunks = payload[0] as unknown[];
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) continue;
    const piece = chunk[0];
    if (typeof piece === "string") {
      out.push(piece);
    }
  }

  const merged = out.join("").trim();
  return merged.length > 0 ? merged : null;
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
