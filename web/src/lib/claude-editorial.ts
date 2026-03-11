import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { FeedItem } from "./rss";
import type {
  ArticleContent,
  SourceContextSnippet,
  MarketImpactAnalysis,
  MarketImpactDirection,
  MarketImpactTimeHorizon,
  AffectedMarket,
} from "./article";
import {
  buildAgentResearchPack,
  type AgentResearchPack,
} from "./agent-swarm";
import { extractEntities, enrichEntities } from "./entity-extract";
import { extractCanonicalClaim } from "./claim-extract";
import { fetchMarkdown, isCloudflareAvailable } from "./cloudflare-crawl";

// ============================================================================
// TWO-PASS CLAUDE EDITORIAL ENGINE
//
// Pass 1 — WRITER: Claude writes a full editorial as natural prose.
//   No JSON constraints. No schema overhead. Just writing.
//   Temperature 1.0 for expressive, confident prose.
//
// Pass 2 — EXTRACTOR: A fast, cheap pass extracts structured metadata
//   from the written editorial into typed JSON.
//   Temperature 0.0 for deterministic extraction.
//
// This separation lets the writer model focus entirely on depth,
// voice, and narrative structure — the JSON formatting tax is zero.
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WRITER_MODEL = "claude-sonnet-4-20250514";
const EXTRACTOR_MODEL = "claude-sonnet-4-20250514";
const WRITER_MAX_TOKENS = 6144;
const EXTRACTOR_MAX_TOKENS = 2048;
const WRITER_TIMEOUT_MS = 45_000;
const EXTRACTOR_TIMEOUT_MS = 15_000;
const SCRAPE_TIMEOUT_MS = 5_000;
const MAX_SCRAPED_CHARS = 8000; // per source — CF markdown is cleaner, Claude handles more context

// ============================================================================
// PASS 1 — WRITER PROMPT
// No JSON. No schema. Just: "Write a brilliant editorial."
// ============================================================================

const WRITER_SYSTEM_PROMPT = `You are the lead editorial writer for pooter.world, a broadsheet newspaper for the internet age. You write with the precision of the Financial Times, the narrative instinct of The New Yorker, and the adversarial skepticism of I.F. Stone.

Your job: given a primary news article and related multi-source coverage, write an ORIGINAL EDITORIAL that makes the reader smarter.

YOUR VOICE:
- Third person, active voice, present tense where possible
- Precise and specific — names, numbers, dates, dollar amounts
- Skeptical but fair. You are not neutral — you are honest
- Dense with insight. No filler, no throat-clearing, no "In today's world..."
- Short punchy sentences mixed with longer analytical ones
- Each paragraph should make exactly one argument, supported by evidence from the sources

STRUCTURE (write these sections with the headers shown):

SUBHEADLINE:
One sentence (max 30 words). This is NOT a summary — it's the editorial angle. What should the reader think about this story that they wouldn't think on their own?

EDITORIAL:
6-10 paragraphs. This is the main body. Structure it as:

Opening — State the news precisely. What happened, who did it, what changed. Be concrete: amounts, dates, names. Don't waste the first sentence on context — start with the news.

Context — Why this matters beyond the headline. Connect it to larger forces. What pattern does this fit? What's the trend line?

Cross-source synthesis — Where sources agree and disagree. Which outlet emphasizes what? What does Source A report that Source B ignores? Be specific about which source said what.

Analysis — Your editorial judgment. What are the second-order effects? Who benefits, who loses? What incentive structures are at play? What would a smart insider notice that a casual reader would miss?

What's missing — What questions does this coverage NOT answer? What data would you need to really understand this? What stakeholder voices are absent?

Forward look — What happens next? What dates, decisions, or triggers should the reader watch? What would change the trajectory?

WIRE SUMMARY:
2-3 sentences. A tight multi-source summary suitable for a wire feed. Or write "NONE" if only one source is available.

BIAS NOTES:
One paragraph on how framing differs across sources. Note editorial leans where known. Or write "NONE" if bias information is unavailable.

MISSING CONTEXT:
One paragraph identifying the biggest gap in coverage — the question nobody is asking, the data nobody has, the stakeholder nobody interviewed. Or write "NONE" if coverage seems comprehensive.

HISTORICAL PARALLEL:
One paragraph connecting this story to a relevant precedent. Not a vague analogy — a specific historical case that illuminates what might happen next. Or write "NONE" if no clear parallel exists.

STAKEHOLDER MAP:
One paragraph mapping who is affected: winners, losers, and those whose interests are unrepresented in the coverage. Or write "NONE" if straightforward.

MARKET IMPACT:
Analyze which financial markets, asset classes, or economic instruments this story could materially affect. Think like a Bloomberg Terminal analyst crossed with a macro strategist.

For EACH affected market/asset (maximum 5), write:
ASSET: [specific name — not "stocks" but "US semiconductor equities" or "Nasdaq-100"] ([ticker if applicable])
DIRECTION: BULLISH / BEARISH / VOLATILE / NEUTRAL
HORIZONS: MINUTES / HOURS / DAYS / WEEKS / MONTHS (comma-separated, most immediate first)
MECHANISM: [one sentence — HOW the news reaches this market]

Start with the most immediately affected, most liquid market. Include non-obvious second-order effects.

Then write:
SIGNIFICANCE: [0-100] (0-20 no relevance, 21-40 noise, 41-60 sector event, 61-80 cross-asset, 81-100 systemic)
HEADLINE: [one sentence market impact summary]
TRANSMISSION: [one sentence — the dominant causal pathway from this news to market movement]

If the story has NO plausible market impact (human interest, local crime, sports), write "NONE"

RULES:
- ONLY use facts present in the provided source material. Never invent quotes, statistics, or events.
- If related articles cover DIFFERENT stories from the primary, IGNORE them. Say so explicitly.
- If sources contradict each other, note the contradiction and which source says what.
- Be specific. "The company raised $50 million" not "The company raised a significant amount."
- Use the SCRAPED CONTENT — it has details the RSS description alone doesn't. Pull out specific figures, dates, and quotes.
- Never pad with generalities. Every sentence should carry information.`;

// ============================================================================
// PASS 2 — EXTRACTOR PROMPT
// Takes the written editorial and extracts structured metadata as JSON.
// ============================================================================

const EXTRACTOR_SYSTEM_PROMPT = `You are a metadata extraction engine. Given a written editorial and source article information, extract structured metadata as JSON.

Return ONLY a valid JSON object with these fields:
{
  "tags": ["tag1", "tag2", ...],
  "claim": "One canonical factual claim — the single most important verifiable assertion in the editorial",
  "relevantRelatedIndices": [0, 1, ...],
  "contextSnippets": [{"source": "outlet name", "link": "url", "summary": "2-3 sentence summary of what this source specifically contributed"}],
  "marketImpact": {
    "significance": 0-100,
    "headline": "one sentence market impact summary",
    "primaryTimeHorizon": "minutes|hours|days|weeks|months",
    "affectedMarkets": [
      {
        "asset": "specific market name",
        "ticker": "BTC or null",
        "direction": "bullish|bearish|volatile|neutral",
        "confidence": 0.0-1.0,
        "timeHorizons": ["hours", "days"],
        "rationale": "one sentence"
      }
    ],
    "topicSlugs": ["btc", "oil"],
    "transmissionMechanism": "how the news reaches markets"
  }
}

Rules for tags: 3-8 lowercase topical tags. Include the story's domain (e.g., "tech", "finance", "politics") plus specific subjects (e.g., "openai", "sec-enforcement", "base-l2").

Rules for claim: Extract the single most newsworthy verifiable fact from the editorial. Must be a complete sentence.

Rules for relevantRelatedIndices: Indices of related articles that ACTUALLY cover the same story as the primary. If a related article is about a different topic, exclude its index.

Rules for contextSnippets: For each relevant source (primary + relevant related), provide a 2-3 sentence summary of what that specific source contributed to the editorial. Focus on unique details each source added.

Rules for marketImpact: Assess financial market implications. Set significance 0-20 for no relevance, 21-40 for noise, 41-60 for sector event, 61-80 for cross-asset, 81-100 for systemic. Max 5 affected markets. topicSlugs should be from: btc, eth, gold, oil, usd, trade, regulation, geopolitics, energy, inflation, labor, ai-tech, climate, fiscal. Set to null if the story has no plausible market impact (human interest, local crime, sports).

Return ONLY valid JSON. No markdown, no explanation.`;

// ============================================================================
// TYPES
// ============================================================================

interface WriterOutput {
  subheadline: string;
  editorialBody: string[];
  wireSummary: string | null;
  biasContext: string | null;
  missingContext: string | null;
  historicalParallel: string | null;
  stakeholderAnalysis: string | null;
  marketImpactRaw: string | null;
}

interface ExtractorOutput {
  tags: string[];
  claim: string;
  relevantRelatedIndices: number[];
  contextSnippets: Array<{ source: string; link: string; summary: string }>;
  marketImpact: MarketImpactAnalysis | null;
}

// ============================================================================
// SOURCE SCRAPING — fetch actual article content for Claude
//
// Strategy: Cloudflare /markdown first (clean markdown, JS-rendered),
//           falls back to direct HTML fetch + our own parser.
// ============================================================================

async function scrapeArticleContent(url: string): Promise<string | null> {
  if (!url) return null;

  // Try Cloudflare /markdown first — returns clean, readable text
  if (isCloudflareAvailable()) {
    try {
      const markdown = await fetchMarkdown(url);
      if (markdown && markdown.length > 100) {
        console.log(`[editorial] CF markdown for ${new URL(url).hostname}: ${markdown.length} chars`);
        return markdown;
      }
    } catch {
      // Fall through to legacy scraper
    }
  }

  // Legacy fallback — direct HTML fetch + our parser
  return scrapeArticleLegacy(url);
}

async function scrapeArticleLegacy(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PooterWorld/1.0 (+https://pooter.world)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;

    const html = await res.text();
    return extractArticleText(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractArticleText(html: string): string {
  const parts: string[] = [];

  // 1. JSON-LD articleBody (richest source — many news sites include full text)
  const ldMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of ldMatches) {
    try {
      const parsed = JSON.parse(cleanHtml(match[1] || ""));
      const body = extractJsonLdBody(parsed);
      if (body) parts.push(body);
    } catch { /* skip invalid json-ld */ }
  }

  // 2. Meta descriptions (og, twitter, standard)
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  const descKeys = ["description", "og:description", "twitter:description"];
  for (const tag of metaTags) {
    const lower = tag.toLowerCase();
    const hasKey = descKeys.some(
      (key) => lower.includes(`name="${key}"`) || lower.includes(`property="${key}"`) ||
        lower.includes(`name='${key}'`) || lower.includes(`property='${key}'`),
    );
    if (!hasKey) continue;
    const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (contentMatch?.[1]) parts.push(cleanHtml(contentMatch[1]));
  }

  // 3. Article paragraphs from <p> tags (strip scripts/styles/nav/footer first)
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  const paragraphs = stripped.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  const articleParagraphs: string[] = [];
  for (const p of paragraphs) {
    const cleaned = cleanHtml(p[1] || "");
    if (cleaned.length >= 50 && cleaned.length <= 800) {
      articleParagraphs.push(cleaned);
    }
    if (articleParagraphs.length >= 20) break;
  }
  if (articleParagraphs.length > 0) {
    parts.push(articleParagraphs.join("\n\n"));
  }

  // Deduplicate and truncate
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.slice(0, 100).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  const combined = unique.join("\n\n");
  return combined.slice(0, MAX_SCRAPED_CHARS);
}

function extractJsonLdBody(node: unknown): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const result = extractJsonLdBody(entry);
      if (result) return result;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;
  if (typeof obj.articleBody === "string" && obj.articleBody.length > 100) {
    return cleanHtml(obj.articleBody);
  }
  if (typeof obj.description === "string" && obj.description.length > 100) {
    return cleanHtml(obj.description);
  }
  return null;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x2019;|&#8217;/gi, "\u2019")
    .replace(/&#x2013;|&#8211;/gi, "\u2013")
    .replace(/&#x2014;|&#8212;/gi, "\u2014")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// USER MESSAGE BUILDER — includes scraped source content
// ============================================================================

async function buildUserMessage(primary: FeedItem, related: FeedItem[]): Promise<string> {
  // Scrape primary + up to 4 related sources in parallel
  const scrapeTargets = [primary, ...related.slice(0, 4)];
  const scrapedResults = await Promise.allSettled(
    scrapeTargets.map((item) => scrapeArticleContent(item.link)),
  );

  const primaryScraped = scrapedResults[0].status === "fulfilled" ? scrapedResults[0].value : null;
  const relatedScraped = scrapedResults.slice(1).map((r) =>
    r.status === "fulfilled" ? r.value : null,
  );

  const lines: string[] = [];

  lines.push("=== PRIMARY ARTICLE ===");
  lines.push(`Title: ${primary.title}`);
  lines.push(`Source: ${primary.source}`);
  lines.push(`Link: ${primary.link}`);
  lines.push(`Category: ${primary.category}`);
  lines.push(`Published: ${primary.pubDate}`);
  if (primary.description) {
    lines.push(`RSS Description: ${primary.description}`);
  }
  if (primary.bias) {
    lines.push(`Source Bias: ${primary.bias.name} | Lean: ${primary.bias.bias} | Factuality: ${primary.bias.factuality} | Country: ${primary.bias.country}`);
  }
  if (primaryScraped) {
    lines.push(`\n--- SCRAPED PAGE CONTENT ---\n${primaryScraped}`);
  } else {
    lines.push(`\n(Could not scrape page content — use RSS description only)`);
  }

  if (related.length > 0) {
    lines.push("\n=== RELATED ARTICLES ===");
    related.forEach((item, i) => {
      lines.push(`\n--- Related #${i} ---`);
      lines.push(`Title: ${item.title}`);
      lines.push(`Source: ${item.source}`);
      lines.push(`Link: ${item.link}`);
      lines.push(`Category: ${item.category}`);
      lines.push(`Published: ${item.pubDate}`);
      if (item.description) {
        lines.push(`RSS Description: ${item.description}`);
      }
      if (item.bias) {
        lines.push(`Source Bias: ${item.bias.name} | Lean: ${item.bias.bias} | Factuality: ${item.bias.factuality}`);
      }
      if (relatedScraped[i]) {
        lines.push(`\n--- SCRAPED PAGE CONTENT ---\n${relatedScraped[i]}`);
      }
    });
  } else {
    lines.push("\n(No related articles available — write editorial from primary source only)");
  }

  return lines.join("\n");
}

// ============================================================================
// PASS 1 — WRITER
// Returns raw editorial prose with section headers.
// ============================================================================

async function runWriterPass(
  client: Anthropic,
  userMessage: string,
): Promise<WriterOutput> {
  const response = await Promise.race([
    client.messages.create({
      model: WRITER_MODEL,
      max_tokens: WRITER_MAX_TOKENS,
      temperature: 1.0,
      system: WRITER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Writer pass timeout")), WRITER_TIMEOUT_MS),
    ),
  ]);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in writer response");
  }

  return parseWriterOutput(textBlock.text);
}

/**
 * Parse the writer's free-form editorial into structured sections.
 * Looks for section headers (SUBHEADLINE:, EDITORIAL:, etc.) and splits.
 */
function parseWriterOutput(raw: string): WriterOutput {
  const text = raw.trim();

  // Extract sections by header markers
  const subheadline = extractSection(text, "SUBHEADLINE") || extractFirstLine(text);
  const editorialRaw = extractSection(text, "EDITORIAL") || "";
  const wireSummaryRaw = extractSection(text, "WIRE SUMMARY");
  const biasRaw = extractSection(text, "BIAS NOTES");
  const missingRaw = extractSection(text, "MISSING CONTEXT");
  const historicalRaw = extractSection(text, "HISTORICAL PARALLEL");
  const stakeholderRaw = extractSection(text, "STAKEHOLDER MAP");
  const marketImpactRaw = extractSection(text, "MARKET IMPACT");

  // Split editorial into paragraphs — each non-empty line block is a paragraph
  const editorialBody = editorialRaw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  // If parsing failed to find sections, treat the whole text as editorial
  if (editorialBody.length === 0) {
    const fallbackParagraphs = text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 30 && !p.startsWith("SUBHEADLINE") && !p.startsWith("WIRE") && !p.startsWith("BIAS") && !p.startsWith("MISSING") && !p.startsWith("HISTORICAL") && !p.startsWith("STAKEHOLDER"));

    if (fallbackParagraphs.length > 0) {
      return {
        subheadline: subheadline || fallbackParagraphs[0].slice(0, 150),
        editorialBody: fallbackParagraphs,
        wireSummary: null,
        biasContext: null,
        missingContext: null,
        historicalParallel: null,
        stakeholderAnalysis: null,
        marketImpactRaw: null,
      };
    }
  }

  const normalize = (s: string | null): string | null =>
    s && s.toLowerCase().trim() !== "none" && s.trim().length > 10 ? s.trim() : null;

  return {
    subheadline: subheadline || "Editorial analysis of breaking developments.",
    editorialBody: editorialBody.length > 0 ? editorialBody : ["Editorial content could not be parsed."],
    wireSummary: normalize(wireSummaryRaw),
    biasContext: normalize(biasRaw),
    missingContext: normalize(missingRaw),
    historicalParallel: normalize(historicalRaw),
    stakeholderAnalysis: normalize(stakeholderRaw),
    marketImpactRaw: normalize(marketImpactRaw),
  };
}

/**
 * Extract content between a section header and the next section header.
 */
function extractSection(text: string, header: string): string | null {
  // Match "HEADER:" or "**HEADER:**" or "## HEADER" at line start
  const headerPattern = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?(?:##?\\s*)?${escapeRegex(header)}:?(?:\\*\\*)?\\s*\\n`,
    "i",
  );

  const match = headerPattern.exec(text);
  if (!match) return null;

  const startIdx = match.index + match[0].length;

  // Find the next section header
  const nextHeaderPattern = /\n\s*(?:\*\*)?(?:##?\s*)?(?:SUBHEADLINE|EDITORIAL|WIRE SUMMARY|BIAS NOTES|MISSING CONTEXT|HISTORICAL PARALLEL|STAKEHOLDER MAP|MARKET IMPACT):?(?:\*\*)?\s*\n/i;

  const remaining = text.slice(startIdx);
  const nextMatch = nextHeaderPattern.exec(remaining);

  const sectionText = nextMatch
    ? remaining.slice(0, nextMatch.index)
    : remaining;

  return sectionText.trim() || null;
}

function extractFirstLine(text: string): string {
  const first = text.split("\n").find((line) => line.trim().length > 10);
  return first?.trim().slice(0, 200) || "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// MARKET IMPACT PARSER — turns writer freeform into structured analysis
// ============================================================================

const VALID_DIRECTIONS: MarketImpactDirection[] = ["bullish", "bearish", "volatile", "neutral"];
const VALID_HORIZONS: MarketImpactTimeHorizon[] = ["minutes", "hours", "days", "weeks", "months"];

/**
 * Parse the writer's freeform MARKET IMPACT section into a structured
 * MarketImpactAnalysis object. Returns null if the section says "NONE"
 * or is unparseable.
 */
function parseMarketImpactSection(raw: string | null): MarketImpactAnalysis | null {
  if (!raw) return null;
  const text = raw.trim();
  if (/^none$/i.test(text)) return null;

  const affectedMarkets: AffectedMarket[] = [];

  // Parse ASSET blocks — each starts with "ASSET:" and has DIRECTION/HORIZONS/MECHANISM
  const assetBlocks = text.split(/(?=^ASSET:)/im);

  for (const block of assetBlocks) {
    const assetMatch = block.match(/^ASSET:\s*(.+?)(?:\(([^)]*)\))?\s*$/im);
    if (!assetMatch) continue;

    const asset = assetMatch[1].trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
    const ticker = assetMatch[2]?.trim() || null;

    const directionMatch = block.match(/DIRECTION:\s*(BULLISH|BEARISH|VOLATILE|NEUTRAL)/i);
    const direction = directionMatch
      ? (directionMatch[1].toLowerCase() as MarketImpactDirection)
      : "volatile";

    const horizonsMatch = block.match(/HORIZONS?:\s*(.+)/i);
    const timeHorizons: MarketImpactTimeHorizon[] = horizonsMatch
      ? horizonsMatch[1]
          .split(/[,/]+/)
          .map((h) => h.trim().toLowerCase() as MarketImpactTimeHorizon)
          .filter((h) => VALID_HORIZONS.includes(h))
      : ["days"];

    const mechanismMatch = block.match(/MECHANISM:\s*(.+)/i);
    const rationale = mechanismMatch?.[1]?.trim() || "";

    if (asset.length > 0) {
      affectedMarkets.push({
        asset,
        ticker,
        direction: VALID_DIRECTIONS.includes(direction) ? direction : "volatile",
        confidence: 0.6, // writer pass doesn't produce confidence; extractor can override
        timeHorizons: timeHorizons.length > 0 ? timeHorizons : ["days"],
        rationale,
      });
    }

    if (affectedMarkets.length >= 5) break;
  }

  // Parse global fields
  const significanceMatch = text.match(/SIGNIFICANCE:\s*(\d+)/i);
  const significance = significanceMatch
    ? Math.min(100, Math.max(0, parseInt(significanceMatch[1], 10)))
    : (affectedMarkets.length > 0 ? 40 : 0);

  const headlineMatch = text.match(/HEADLINE:\s*(.+)/i);
  const headline = headlineMatch?.[1]?.trim() || "";

  const transmissionMatch = text.match(/TRANSMISSION:\s*(.+)/i);
  const transmissionMechanism = transmissionMatch?.[1]?.trim() || null;

  if (affectedMarkets.length === 0 && !headline) return null;

  // Determine primary time horizon from the most immediate affected market
  const primaryTimeHorizon: MarketImpactTimeHorizon =
    affectedMarkets[0]?.timeHorizons[0] || "days";

  return {
    significance,
    headline,
    primaryTimeHorizon,
    affectedMarkets,
    topicSlugs: [], // populated by extractor or fallback
    transmissionMechanism,
  };
}

// ============================================================================
// PASS 2 — EXTRACTOR
// Takes the editorial + source data and extracts structured metadata.
// ============================================================================

async function runExtractorPass(
  client: Anthropic,
  editorial: WriterOutput,
  primary: FeedItem,
  related: FeedItem[],
): Promise<ExtractorOutput> {
  const editorialText = [
    `Subheadline: ${editorial.subheadline}`,
    "",
    ...editorial.editorialBody,
    "",
    editorial.missingContext ? `Missing Context: ${editorial.missingContext}` : "",
    editorial.historicalParallel ? `Historical Parallel: ${editorial.historicalParallel}` : "",
    editorial.stakeholderAnalysis ? `Stakeholder Analysis: ${editorial.stakeholderAnalysis}` : "",
    editorial.marketImpactRaw ? `Market Impact (writer analysis):\n${editorial.marketImpactRaw}` : "",
  ].filter(Boolean).join("\n\n");

  const sourceInfo = [
    `Primary source: ${primary.source} — "${primary.title}" — ${primary.link}`,
    ...related.map((r, i) => `Related #${i}: ${r.source} — "${r.title}" — ${r.link}`),
  ].join("\n");

  const userMessage = `EDITORIAL TEXT:\n${editorialText}\n\nSOURCE ARTICLES:\n${sourceInfo}`;

  const response = await Promise.race([
    client.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: EXTRACTOR_MAX_TOKENS,
      temperature: 0,
      system: EXTRACTOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Extractor pass timeout")), EXTRACTOR_TIMEOUT_MS),
    ),
  ]);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in extractor response");
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(jsonText);
  return validateExtractorOutput(parsed, primary, related);
}

function validateExtractorOutput(
  data: unknown,
  primary: FeedItem,
  related: FeedItem[],
): ExtractorOutput {
  if (!data || typeof data !== "object") {
    throw new Error("Extractor response is not an object");
  }

  const resp = data as Record<string, unknown>;

  return {
    tags: Array.isArray(resp.tags)
      ? (resp.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 10)
      : [primary.category.toLowerCase()],
    claim: typeof resp.claim === "string" && resp.claim.length > 0
      ? resp.claim
      : `${primary.source} reports: ${primary.title}`,
    relevantRelatedIndices: Array.isArray(resp.relevantRelatedIndices)
      ? (resp.relevantRelatedIndices as unknown[])
          .filter((n): n is number => typeof n === "number" && n >= 0 && n < related.length)
      : related.map((_, i) => i),
    contextSnippets: Array.isArray(resp.contextSnippets)
      ? (resp.contextSnippets as unknown[])
          .filter(
            (s): s is { source: string; link: string; summary: string } =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as Record<string, unknown>).source === "string" &&
              typeof (s as Record<string, unknown>).link === "string" &&
              typeof (s as Record<string, unknown>).summary === "string",
          )
      : [],
    marketImpact: validateMarketImpact(resp.marketImpact),
  };
}

/**
 * Validate and normalize a market impact object from the extractor.
 * Returns null for missing/invalid data or stories with no market relevance.
 */
function validateMarketImpact(data: unknown): MarketImpactAnalysis | null {
  if (!data || typeof data !== "object") return null;

  const d = data as Record<string, unknown>;

  const significance = typeof d.significance === "number"
    ? Math.min(100, Math.max(0, Math.round(d.significance)))
    : 0;

  const headline = typeof d.headline === "string" ? d.headline.trim() : "";
  if (!headline) return null;

  const primaryTimeHorizon = typeof d.primaryTimeHorizon === "string" &&
    VALID_HORIZONS.includes(d.primaryTimeHorizon as MarketImpactTimeHorizon)
    ? (d.primaryTimeHorizon as MarketImpactTimeHorizon)
    : "days";

  const affectedMarkets: AffectedMarket[] = [];
  if (Array.isArray(d.affectedMarkets)) {
    for (const raw of (d.affectedMarkets as unknown[]).slice(0, 5)) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;

      const asset = typeof m.asset === "string" ? m.asset.trim() : "";
      if (!asset) continue;

      const ticker = typeof m.ticker === "string" && m.ticker.trim() ? m.ticker.trim() : null;

      const direction = typeof m.direction === "string" &&
        VALID_DIRECTIONS.includes(m.direction.toLowerCase() as MarketImpactDirection)
        ? (m.direction.toLowerCase() as MarketImpactDirection)
        : "volatile";

      const confidence = typeof m.confidence === "number"
        ? Math.min(1, Math.max(0, m.confidence))
        : 0.5;

      const timeHorizons: MarketImpactTimeHorizon[] = Array.isArray(m.timeHorizons)
        ? (m.timeHorizons as unknown[])
            .filter((h): h is string => typeof h === "string")
            .map((h) => h.toLowerCase() as MarketImpactTimeHorizon)
            .filter((h) => VALID_HORIZONS.includes(h))
        : [primaryTimeHorizon];

      const rationale = typeof m.rationale === "string" ? m.rationale.trim() : "";

      affectedMarkets.push({ asset, ticker, direction, confidence, timeHorizons, rationale });
    }
  }

  const topicSlugs = Array.isArray(d.topicSlugs)
    ? (d.topicSlugs as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const transmissionMechanism = typeof d.transmissionMechanism === "string"
    ? d.transmissionMechanism.trim() || null
    : null;

  return {
    significance,
    headline,
    primaryTimeHorizon,
    affectedMarkets,
    topicSlugs,
    transmissionMechanism,
  };
}

// ============================================================================
// MAIN GENERATION — TWO-PASS PIPELINE
// ============================================================================

/**
 * Generate a deep AI-powered editorial using a two-pass Claude pipeline.
 *
 * Pass 1: Writer — produces natural prose with no JSON constraints.
 * Pass 2: Extractor — pulls structured metadata from the editorial.
 *
 * Throws if ANTHROPIC_API_KEY is not set or if the API calls fail.
 */
export async function generateAIEditorial(
  primary: FeedItem,
  related: FeedItem[],
): Promise<ArticleContent & { generatedBy: "claude-ai" }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set — falling back to template");
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Scrape sources and build the user message
  const userMessage = await buildUserMessage(primary, related);

  // PASS 1: Writer — natural prose, no JSON
  console.log(`[editorial] Pass 1 (writer) starting for "${primary.title.slice(0, 60)}..."`);
  const writerOutput = await runWriterPass(client, userMessage);
  console.log(`[editorial] Pass 1 complete — ${writerOutput.editorialBody.length} paragraphs`);

  // PASS 2: Extractor — structured metadata from the prose
  console.log(`[editorial] Pass 2 (extractor) starting...`);
  let extractorOutput: ExtractorOutput;
  try {
    extractorOutput = await runExtractorPass(client, writerOutput, primary, related);
    console.log(`[editorial] Pass 2 complete — ${extractorOutput.tags.length} tags, ${extractorOutput.contextSnippets.length} snippets`);
  } catch (err) {
    // Extractor failure is non-fatal — we have the editorial, just use defaults
    console.warn("[editorial] Extractor pass failed, using defaults:", err instanceof Error ? err.message : err);
    extractorOutput = {
      tags: [primary.category.toLowerCase()],
      claim: extractCanonicalClaim({
        title: primary.title,
        description: primary.description,
        url: primary.link,
      }),
      relevantRelatedIndices: related.map((_, i) => i),
      contextSnippets: [],
      marketImpact: null,
    };
  }

  // Filter related sources to only those Claude deemed relevant
  const relevantRelated =
    extractorOutput.relevantRelatedIndices.length > 0
      ? extractorOutput.relevantRelatedIndices
          .filter((i) => i >= 0 && i < related.length)
          .map((i) => related[i])
      : related;

  // Build the agent research pack using existing machinery
  const relatedSummaryByLink = Object.fromEntries(
    extractorOutput.contextSnippets.map((s) => [s.link, s.summary]),
  );
  const agentResearch: AgentResearchPack = buildAgentResearchPack({
    primary,
    related: relevantRelated,
    fallbackClaim: extractorOutput.claim,
    primarySummary: writerOutput.editorialBody[0] || primary.description || "",
    relatedSummaryByLink,
  });

  // Extract entities from editorial text
  const entities = enrichEntities(
    extractEntities(writerOutput.editorialBody),
    writerOutput.editorialBody,
    writerOutput.biasContext,
  );

  const contextSnippets: SourceContextSnippet[] = extractorOutput.contextSnippets.map(
    (s) => ({
      source: s.source,
      link: s.link,
      summary: s.summary,
    }),
  );

  // Merge market impact: extractor JSON preferred, writer freeform fallback
  const marketImpact: MarketImpactAnalysis | null =
    extractorOutput.marketImpact
    ?? parseMarketImpactSection(writerOutput.marketImpactRaw)
    ?? null;

  if (marketImpact) {
    console.log(`[editorial] Market impact: significance=${marketImpact.significance}, ${marketImpact.affectedMarkets.length} markets`);
  }

  return {
    primary,
    claim: extractorOutput.claim,
    relatedSources: relevantRelated,
    subheadline: writerOutput.subheadline,
    subheadlineEnglish: null,
    editorialBody: writerOutput.editorialBody,
    editorialBodyEnglish: undefined,
    wireSummary: writerOutput.wireSummary,
    biasContext: writerOutput.biasContext,
    tags: extractorOutput.tags.length > 0 ? extractorOutput.tags : [primary.category.toLowerCase()],
    contextSnippets,
    agentResearch,
    entities,
    missingContext: writerOutput.missingContext,
    historicalParallel: writerOutput.historicalParallel,
    stakeholderAnalysis: writerOutput.stakeholderAnalysis,
    marketImpact,
    generatedBy: "claude-ai" as const,
  };
}
