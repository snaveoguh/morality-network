// ─── Moral Commentary — Original Analysis from the Moral Compass ─────────────
//
// Generates original "Moral Commentary" articles by combining:
//   1. The agent's learned moral compass (principles + synthesis)
//   2. Current news headlines from RSS feeds
//   3. Stored moral principles with philosophical citations
//
// Output: Academic-style commentary articles with proper citations back to
// the philosophy sources the compass learned from. These appear in the
// feed and archive as "Moral Commentary" pieces attributed to "pooter world".
//
// Architecture:
//   - Single LLM call generates a full commentary (~1500 words)
//   - Saved to editorial archive with generatedBy: "claude-ai"
//   - Rendered in feed/article pages like any other editorial
//   - Triggered daily at 4 AM UTC (1 hour after moral compass crawl)
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";

import type { FeedItem } from "./rss";
import type { ArticleContent } from "./article";
import { fetchAllFeeds } from "./rss";
import { computeEntityHash } from "./entity";
import { generateTextForTask } from "./ai-provider";
import { hasAIProviderForTask } from "./ai-models";
import { saveEditorial, getArchivedEditorial } from "./editorial-archive";
import { getMoralCompassSynthesis } from "./agents/core/moral-compass";
import { recall } from "./agents/core/memory";
import { reportWarn } from "./report-error";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MoralCommentaryResult {
  generated: boolean;
  hash: string | null;
  title: string | null;
  error?: string;
  skipped?: boolean;
}

interface MoralPrincipleCompact {
  statement: string;
  category: string;
  tradition: string;
  relevantAxes: string[];
  confidence: number;
  sources: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BRAND_NAME = "pooter world";
const COMMENTARY_CATEGORY = "Moral Commentary";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 45_000;
const MAX_HEADLINES = 40;
const MAX_PRINCIPLES_IN_PROMPT = 20;

// ─── Commentary ID ──────────────────────────────────────────────────────────

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCommentaryId(date?: string): string {
  return `pooter-moral-commentary-${date ?? getTodayUTC()}`;
}

export function getCommentaryHash(date?: string): `0x${string}` {
  return computeEntityHash(getCommentaryId(date));
}

// ─── Load moral principles for citation ─────────────────────────────────────

async function loadTopPrinciples(): Promise<MoralPrincipleCompact[]> {
  const entries = await recall("moral-compass");
  const principles: MoralPrincipleCompact[] = [];

  for (const entry of entries) {
    try {
      const p = JSON.parse(entry.content);
      if (p.statement && p.confidence >= 0.3) {
        principles.push({
          statement: p.statement,
          category: p.category,
          tradition: p.tradition,
          relevantAxes: p.relevantAxes ?? [],
          confidence: p.confidence,
          sources: p.sources ?? [],
        });
      }
    } catch {
      // Skip malformed
    }
  }

  // Sort by confidence, take top N
  return principles
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PRINCIPLES_IN_PROMPT);
}

// ─── System prompt ──────────────────────────────────────────────────────────

const COMMENTARY_SYSTEM_PROMPT = `You are the moral philosophy correspondent for pooter.world, a broadsheet newspaper for the internet age. You write original "Moral Commentary" articles — academic-grade analysis that applies ethical philosophy to current events.

Your voice: precise, scholarly but accessible, never preachy. You write like a philosophy professor contributing a column to the Financial Times — rigorous but readable. You cite your sources.

FORMAT YOUR OUTPUT EXACTLY LIKE THIS:

TITLE: [A compelling, newspaper-worthy title — max 12 words]

SUBHEADLINE: [One sentence that frames the moral question at stake]

CLAIM: [One sentence — the core moral thesis of this commentary]

BODY:
[Write 4-6 substantial paragraphs of moral analysis. Requirements:
- Ground every argument in at least one named philosophical tradition or thinker
- Use inline citations in brackets like [Kant, Groundwork] or [Rawls, A Theory of Justice] or [SEP: Consequentialism]
- When referencing a moral principle from your CITED PRINCIPLES section, cite its source URL
- Apply abstract principles to concrete current events from the headlines
- Acknowledge genuine moral tensions — don't oversimplify
- Include at least one counterargument from a different tradition
- End with a forward-looking moral question, not a neat conclusion]

REFERENCES:
[List 3-8 references in academic format:
- AuthorOrSource. "Title or Entry Name." Source/Publication. URL-if-available.
- Map at least some references to the CITED PRINCIPLES source URLs provided]

TAGS: [comma-separated: 3-5 relevant tags like ethics, war, technology, justice, etc.]

MISSING_CONTEXT: [One paragraph on what mainstream coverage of these events fails to examine morally]

HISTORICAL_PARALLEL: [One paragraph connecting current events to a historical moral precedent]`;

// ─── Gather headlines ───────────────────────────────────────────────────────

async function gatherCurrentHeadlines(): Promise<FeedItem[]> {
  try {
    const feeds = await fetchAllFeeds();
    // Take most recent items, prioritize high-severity topics
    const sorted = feeds
      .filter((item) => item.title && item.link)
      .sort((a, b) => {
        const dateA = new Date(a.pubDate).getTime() || 0;
        const dateB = new Date(b.pubDate).getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, MAX_HEADLINES);
    return sorted;
  } catch (err) {
    console.warn(
      "[moral-commentary] failed to gather headlines:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Build user message ─────────────────────────────────────────────────────

function buildUserMessage(
  headlines: FeedItem[],
  principles: MoralPrincipleCompact[],
  synthesis: string,
): string {
  const headlineBlock = headlines
    .map((item) => {
      const desc = item.description ? ` — ${item.description.slice(0, 100)}` : "";
      return `- [${item.source}] ${item.title}${desc}`;
    })
    .join("\n");

  const principleBlock = principles
    .map((p, i) => {
      const sourceStr = p.sources.length > 0 ? ` (Source: ${p.sources[0]})` : "";
      return `${i + 1}. [${p.category}/${p.tradition}] ${p.statement}${sourceStr}`;
    })
    .join("\n");

  return `Write a Moral Commentary article for today (${getTodayUTC()}).

MORAL COMPASS SYNTHESIS:
${synthesis}

CITED PRINCIPLES (reference these with their source URLs):
${principleBlock}

TODAY'S HEADLINES:
${headlineBlock}

Choose the 2-3 most morally significant stories from the headlines. Write an original commentary that applies the moral principles above to analyze these events. Cite your philosophical sources properly.`;
}

// ─── Parse output ───────────────────────────────────────────────────────────

interface ParsedCommentary {
  title: string;
  subheadline: string;
  claim: string;
  body: string[];
  references: string[];
  tags: string[];
  missingContext: string | null;
  historicalParallel: string | null;
}

function parseCommentaryOutput(raw: string): ParsedCommentary | null {
  // Strip think tags
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  const titleMatch = text.match(/TITLE:\s*(.+)/i);
  const subMatch = text.match(/SUBHEADLINE:\s*(.+)/i);
  const claimMatch = text.match(/CLAIM:\s*(.+)/i);

  if (!titleMatch || !claimMatch) return null;

  // Extract BODY section
  const bodyMatch = text.match(/BODY:\s*([\s\S]*?)(?=\nREFERENCES:|\nTAGS:|\nMISSING_CONTEXT:|\nHISTORICAL_PARALLEL:|$)/i);
  const bodyText = bodyMatch?.[1]?.trim() ?? "";
  const bodyParagraphs = bodyText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 50);

  if (bodyParagraphs.length < 2) return null;

  // Extract REFERENCES
  const refsMatch = text.match(/REFERENCES:\s*([\s\S]*?)(?=\nTAGS:|\nMISSING_CONTEXT:|\nHISTORICAL_PARALLEL:|$)/i);
  const references = (refsMatch?.[1] ?? "")
    .split("\n")
    .map((r) => r.replace(/^[-•*]\s*/, "").trim())
    .filter((r) => r.length > 10);

  // Extract TAGS
  const tagsMatch = text.match(/TAGS:\s*(.+)/i);
  const tags = (tagsMatch?.[1] ?? "ethics")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  // Extract MISSING_CONTEXT
  const missingMatch = text.match(/MISSING_CONTEXT:\s*([\s\S]*?)(?=\nHISTORICAL_PARALLEL:|$)/i);
  const missingContext = missingMatch?.[1]?.trim() || null;

  // Extract HISTORICAL_PARALLEL
  const histMatch = text.match(/HISTORICAL_PARALLEL:\s*([\s\S]*?)$/i);
  const historicalParallel = histMatch?.[1]?.trim() || null;

  return {
    title: titleMatch[1].trim(),
    subheadline: subMatch?.[1]?.trim() ?? "",
    claim: claimMatch[1].trim(),
    body: bodyParagraphs,
    references,
    tags: [...tags, "moral-commentary"],
    missingContext,
    historicalParallel,
  };
}

// ─── Build ArticleContent from parsed commentary ────────────────────────────

function buildArticleContent(
  parsed: ParsedCommentary,
  headlines: FeedItem[],
): ArticleContent {
  const now = new Date().toISOString();
  const commentaryId = getCommentaryId();

  // Build a synthetic primary FeedItem for the commentary
  const primary: FeedItem = {
    id: commentaryId,
    title: parsed.title,
    link: `https://pooter.world/article/${getCommentaryHash()}`,
    description: parsed.subheadline || parsed.claim,
    pubDate: now,
    source: BRAND_NAME,
    sourceUrl: "https://pooter.world",
    category: COMMENTARY_CATEGORY,
    tags: parsed.tags,
    canonicalClaim: parsed.claim,
  };

  // Add references as a final paragraph
  const bodyWithRefs = [...parsed.body];
  if (parsed.references.length > 0) {
    bodyWithRefs.push(
      "**References**\n" + parsed.references.map((r) => `- ${r}`).join("\n"),
    );
  }

  return {
    primary,
    claim: parsed.claim,
    relatedSources: headlines.slice(0, 5), // Top headlines as related context
    subheadline: parsed.subheadline,
    editorialBody: bodyWithRefs,
    wireSummary: null,
    biasContext: "This is an AI-generated moral commentary produced by pooter world's autonomous moral compass — an evolving ethical framework learned from philosophical sources including the Stanford Encyclopedia of Philosophy, Internet Encyclopedia of Philosophy, and other academic ethics resources.",
    tags: parsed.tags,
    contextSnippets: [],
    agentResearch: {
      canonicalClaim: parsed.claim,
      claimVariants: [],
      evidence: [],
      contradictionFlags: [],
      sourceCount: 0,
    },
    missingContext: parsed.missingContext,
    historicalParallel: parsed.historicalParallel,
    stakeholderAnalysis: null,
    marketImpact: null,
    storyCountries: [],
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate today's Moral Commentary article.
 * Combines the moral compass synthesis + top principles + current headlines
 * into an original, cited philosophical analysis.
 */
export async function generateMoralCommentary(): Promise<MoralCommentaryResult> {
  const hash = getCommentaryHash();

  // 1. Check if today's commentary already exists
  try {
    const existing = await getArchivedEditorial(hash);
    if (existing) {
      console.log(`[moral-commentary] today's commentary already exists: ${hash.slice(0, 10)}`);
      return {
        generated: false,
        hash,
        title: existing.primary.title,
        skipped: true,
      };
    }
  } catch (e) {
    reportWarn("moral-commentary:archive", e);
  }

  // 2. Check AI availability
  if (!hasAIProviderForTask("editorialWriter")) {
    return {
      generated: false,
      hash: null,
      title: null,
      error: "No AI provider available for editorialWriter task",
    };
  }

  // 3. Get moral compass data
  const synthesis = await getMoralCompassSynthesis();
  if (!synthesis) {
    return {
      generated: false,
      hash: null,
      title: null,
      error: "Moral compass has no synthesis yet — needs more crawling first",
    };
  }

  const principles = await loadTopPrinciples();
  if (principles.length < 3) {
    return {
      generated: false,
      hash: null,
      title: null,
      error: `Not enough principles (${principles.length}) — need at least 3`,
    };
  }

  // 4. Gather current headlines
  const headlines = await gatherCurrentHeadlines();
  if (headlines.length < 5) {
    return {
      generated: false,
      hash: null,
      title: null,
      error: `Not enough headlines (${headlines.length}) — need at least 5`,
    };
  }

  // 5. Generate commentary
  console.log(
    `[moral-commentary] generating with ${principles.length} principles, ${headlines.length} headlines`,
  );

  try {
    const result = await generateTextForTask({
      task: "editorialWriter",
      system: COMMENTARY_SYSTEM_PROMPT,
      user: buildUserMessage(headlines, principles, synthesis),
      maxTokens: MAX_TOKENS,
      temperature: 0.8,
      timeoutMs: TIMEOUT_MS,
    });

    const parsed = parseCommentaryOutput(result.text);
    if (!parsed) {
      return {
        generated: false,
        hash,
        title: null,
        error: `Failed to parse commentary output: ${result.text.slice(0, 200)}`,
      };
    }

    // 6. Build and save
    const article = buildArticleContent(parsed, headlines);
    await saveEditorial(hash, article, "claude-ai");

    console.log(`[moral-commentary] saved: "${parsed.title}" (${hash.slice(0, 10)})`);

    return {
      generated: true,
      hash,
      title: parsed.title,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[moral-commentary] generation failed:", msg);
    return {
      generated: false,
      hash,
      title: null,
      error: msg,
    };
  }
}

/**
 * Check if today's commentary exists.
 */
export async function hasCommentaryForToday(): Promise<boolean> {
  try {
    const existing = await getArchivedEditorial(getCommentaryHash());
    return existing !== null;
  } catch {
    return false;
  }
}
