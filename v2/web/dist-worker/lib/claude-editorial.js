"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIEditorial = generateAIEditorial;
require("server-only");
const agent_swarm_1 = require("./agent-swarm");
const ai_provider_1 = require("./ai-provider");
const ai_models_1 = require("./ai-models");
const entity_extract_1 = require("./entity-extract");
const claim_extract_1 = require("./claim-extract");
const cloudflare_crawl_1 = require("./cloudflare-crawl");
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

Your job: given a primary news article and related multi-source coverage, write an ORIGINAL EDITORIAL that makes the reader smarter — and makes them feel something.

YOUR VOICE:
- Third person, active voice, present tense where possible
- Precise and specific — names, numbers, dates, dollar amounts
- Skeptical but fair. You are not neutral — you are honest
- Dense with insight. No filler, no throat-clearing, no "In today's world..."
- Short punchy sentences mixed with longer analytical ones
- Each paragraph should make exactly one argument, supported by evidence from the sources
- Use the identifiable victim effect: one person's concrete story hits harder than abstract statistics. When the story has a human at its center, lead with them.
- Vary your emotional register. Some stories call for fury. Some for dark humor. Some for quiet devastation. Match the tone to the material, don't flatten everything into the same "skeptical analyst" voice.

STRUCTURE (write these sections with the headers shown):

SUBHEADLINE:
One sentence (max 30 words). This is NOT a summary and NOT a restatement of the headline. It's the editorial angle — the thought the reader wouldn't have on their own. It must contain information or framing that the headline does not. If the headline says what happened, the subheadline says why it matters or what it reveals.

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
- If related articles cover DIFFERENT stories from the primary, IGNORE them instead of blending them into the editorial.
- If sources contradict each other, note the contradiction and which source says what.
- Be specific. "The company raised $50 million" not "The company raised a significant amount."
- Use the SCRAPED CONTENT — it has details the RSS description alone doesn't. Pull out specific figures, dates, and quotes.
- If page scraping fails, still write the editorial from the title, RSS description, source metadata, and any usable related coverage.
- If only the primary article is usable, write a narrower primary-source editorial rather than refusing.
- Never answer with an explanation of why you cannot write, why the sources are insufficient, or what additional material you would need.
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
// SOURCE SCRAPING — fetch actual article content for Claude
//
// Strategy: Cloudflare /markdown first (clean markdown, JS-rendered),
//           falls back to direct HTML fetch + our own parser.
// ============================================================================
async function scrapeArticleContent(url) {
    if (!url)
        return null;
    // Try Cloudflare /markdown first — returns clean, readable text
    if ((0, cloudflare_crawl_1.isCloudflareAvailable)()) {
        try {
            const markdown = await (0, cloudflare_crawl_1.fetchMarkdown)(url);
            if (markdown && markdown.length > 100) {
                console.log(`[editorial] CF markdown for ${new URL(url).hostname}: ${markdown.length} chars`);
                return markdown;
            }
        }
        catch {
            // Fall through to legacy scraper
        }
    }
    // Legacy fallback — direct HTML fetch + our parser
    return scrapeArticleLegacy(url);
}
async function scrapeArticleLegacy(url) {
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
        if (!res.ok)
            return null;
        const contentType = res.headers.get("content-type") || "";
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType))
            return null;
        const html = await res.text();
        return extractArticleText(html);
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
function extractArticleText(html) {
    const parts = [];
    // 1. JSON-LD articleBody (richest source — many news sites include full text)
    const ldMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of ldMatches) {
        try {
            const parsed = JSON.parse(cleanHtml(match[1] || ""));
            const body = extractJsonLdBody(parsed);
            if (body)
                parts.push(body);
        }
        catch { /* skip invalid json-ld */ }
    }
    // 2. Meta descriptions (og, twitter, standard)
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    const descKeys = ["description", "og:description", "twitter:description"];
    for (const tag of metaTags) {
        const lower = tag.toLowerCase();
        const hasKey = descKeys.some((key) => lower.includes(`name="${key}"`) || lower.includes(`property="${key}"`) ||
            lower.includes(`name='${key}'`) || lower.includes(`property='${key}'`));
        if (!hasKey)
            continue;
        const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
        if (contentMatch?.[1])
            parts.push(cleanHtml(contentMatch[1]));
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
    const articleParagraphs = [];
    for (const p of paragraphs) {
        const cleaned = cleanHtml(p[1] || "");
        if (cleaned.length >= 50 && cleaned.length <= 800) {
            articleParagraphs.push(cleaned);
        }
        if (articleParagraphs.length >= 20)
            break;
    }
    if (articleParagraphs.length > 0) {
        parts.push(articleParagraphs.join("\n\n"));
    }
    // Deduplicate and truncate
    const seen = new Set();
    const unique = [];
    for (const part of parts) {
        const key = part.slice(0, 100).toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(part);
    }
    const combined = unique.join("\n\n");
    return combined.slice(0, MAX_SCRAPED_CHARS);
}
function extractJsonLdBody(node) {
    if (!node)
        return null;
    if (Array.isArray(node)) {
        for (const entry of node) {
            const result = extractJsonLdBody(entry);
            if (result)
                return result;
        }
        return null;
    }
    if (typeof node !== "object")
        return null;
    const obj = node;
    if (typeof obj.articleBody === "string" && obj.articleBody.length > 100) {
        return cleanHtml(obj.articleBody);
    }
    if (typeof obj.description === "string" && obj.description.length > 100) {
        return cleanHtml(obj.description);
    }
    return null;
}
function cleanHtml(text) {
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
async function buildUserMessage(primary, related) {
    // Scrape primary + up to 4 related sources in parallel
    const scrapeTargets = [primary, ...related.slice(0, 4)];
    const scrapedResults = await Promise.allSettled(scrapeTargets.map((item) => scrapeArticleContent(item.link)));
    const primaryScraped = scrapedResults[0].status === "fulfilled" ? scrapedResults[0].value : null;
    const relatedScraped = scrapedResults.slice(1).map((r) => r.status === "fulfilled" ? r.value : null);
    const lines = [];
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
    }
    else {
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
    }
    else {
        lines.push("\n(No related articles available — write editorial from primary source only)");
    }
    return lines.join("\n");
}
// ============================================================================
// PASS 1 — WRITER
// Returns raw editorial prose with section headers.
// ============================================================================
async function runWriterPass(userMessage) {
    const result = await (0, ai_provider_1.generateTextForTask)({
        task: "editorialWriter",
        maxTokens: WRITER_MAX_TOKENS,
        temperature: 1,
        timeoutMs: WRITER_TIMEOUT_MS,
        system: WRITER_SYSTEM_PROMPT,
        user: userMessage,
    });
    if (looksLikeEditorialRefusal(result.text)) {
        throw new Error("Writer refusal: insufficient usable source material");
    }
    return parseWriterOutput(result.text);
}
function looksLikeEditorialRefusal(text) {
    const normalized = text.trim().toLowerCase();
    if (!normalized)
        return true;
    const refusalPatterns = [
        /cannot write an editorial/,
        /can't write an editorial/,
        /lack sufficient source material/,
        /insufficient source material/,
        /without scraped content/,
        /without the full scraped content/,
        /related articles cover entirely different topics/,
        /related coverage (?:does not|doesn't) provide/,
        /would need either/,
        /to properly cover this story/,
    ];
    const hits = refusalPatterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
    return hits >= 2 || /^i\s+(cannot|can't|do not have|don't have)/.test(normalized);
}
/**
 * Parse the writer's free-form editorial into structured sections.
 * Looks for section headers (SUBHEADLINE:, EDITORIAL:, etc.) and splits.
 */
function parseWriterOutput(raw) {
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
    const normalize = (s) => s && s.toLowerCase().trim() !== "none" && s.trim().length > 10 ? s.trim() : null;
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
function extractSection(text, header) {
    // Match "HEADER:" or "**HEADER:**" or "## HEADER" at line start
    const headerPattern = new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?(?:##?\\s*)?${escapeRegex(header)}:?(?:\\*\\*)?\\s*\\n`, "i");
    const match = headerPattern.exec(text);
    if (!match)
        return null;
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
function extractFirstLine(text) {
    const first = text.split("\n").find((line) => line.trim().length > 10);
    return first?.trim().slice(0, 200) || "";
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// ============================================================================
// MARKET IMPACT PARSER — turns writer freeform into structured analysis
// ============================================================================
const VALID_DIRECTIONS = ["bullish", "bearish", "volatile", "neutral"];
const VALID_HORIZONS = ["minutes", "hours", "days", "weeks", "months"];
/**
 * Parse the writer's freeform MARKET IMPACT section into a structured
 * MarketImpactAnalysis object. Returns null if the section says "NONE"
 * or is unparseable.
 */
function parseMarketImpactSection(raw) {
    if (!raw)
        return null;
    const text = raw.trim();
    if (/^none$/i.test(text))
        return null;
    const affectedMarkets = [];
    // Parse ASSET blocks — each starts with "ASSET:" and has DIRECTION/HORIZONS/MECHANISM
    const assetBlocks = text.split(/(?=^ASSET:)/im);
    for (const block of assetBlocks) {
        const assetMatch = block.match(/^ASSET:\s*(.+?)(?:\(([^)]*)\))?\s*$/im);
        if (!assetMatch)
            continue;
        const asset = assetMatch[1].trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
        const ticker = assetMatch[2]?.trim() || null;
        const directionMatch = block.match(/DIRECTION:\s*(BULLISH|BEARISH|VOLATILE|NEUTRAL)/i);
        const direction = directionMatch
            ? directionMatch[1].toLowerCase()
            : "volatile";
        const horizonsMatch = block.match(/HORIZONS?:\s*(.+)/i);
        const timeHorizons = horizonsMatch
            ? horizonsMatch[1]
                .split(/[,/]+/)
                .map((h) => h.trim().toLowerCase())
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
        if (affectedMarkets.length >= 5)
            break;
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
    if (affectedMarkets.length === 0 && !headline)
        return null;
    // Determine primary time horizon from the most immediate affected market
    const primaryTimeHorizon = affectedMarkets[0]?.timeHorizons[0] || "days";
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
async function runExtractorPass(editorial, primary, related) {
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
    const result = await (0, ai_provider_1.generateTextForTask)({
        task: "editorialExtractor",
        maxTokens: EXTRACTOR_MAX_TOKENS,
        temperature: 0,
        timeoutMs: EXTRACTOR_TIMEOUT_MS,
        system: EXTRACTOR_SYSTEM_PROMPT,
        user: userMessage,
    });
    let jsonText = result.text.trim();
    if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(jsonText);
    return validateExtractorOutput(parsed, primary, related);
}
function validateExtractorOutput(data, primary, related) {
    if (!data || typeof data !== "object") {
        throw new Error("Extractor response is not an object");
    }
    const resp = data;
    return {
        tags: Array.isArray(resp.tags)
            ? resp.tags.filter((t) => typeof t === "string").slice(0, 10)
            : [primary.category.toLowerCase()],
        claim: typeof resp.claim === "string" && resp.claim.length > 0
            ? resp.claim
            : `${primary.source} reports: ${primary.title}`,
        relevantRelatedIndices: Array.isArray(resp.relevantRelatedIndices)
            ? resp.relevantRelatedIndices
                .filter((n) => typeof n === "number" && n >= 0 && n < related.length)
            : related.map((_, i) => i),
        contextSnippets: Array.isArray(resp.contextSnippets)
            ? resp.contextSnippets
                .filter((s) => typeof s === "object" &&
                s !== null &&
                typeof s.source === "string" &&
                typeof s.link === "string" &&
                typeof s.summary === "string")
            : [],
        marketImpact: validateMarketImpact(resp.marketImpact),
    };
}
/**
 * Validate and normalize a market impact object from the extractor.
 * Returns null for missing/invalid data or stories with no market relevance.
 */
function validateMarketImpact(data) {
    if (!data || typeof data !== "object")
        return null;
    const d = data;
    const significance = typeof d.significance === "number"
        ? Math.min(100, Math.max(0, Math.round(d.significance)))
        : 0;
    const headline = typeof d.headline === "string" ? d.headline.trim() : "";
    if (!headline)
        return null;
    const primaryTimeHorizon = typeof d.primaryTimeHorizon === "string" &&
        VALID_HORIZONS.includes(d.primaryTimeHorizon)
        ? d.primaryTimeHorizon
        : "days";
    const affectedMarkets = [];
    if (Array.isArray(d.affectedMarkets)) {
        for (const raw of d.affectedMarkets.slice(0, 5)) {
            if (!raw || typeof raw !== "object")
                continue;
            const m = raw;
            const asset = typeof m.asset === "string" ? m.asset.trim() : "";
            if (!asset)
                continue;
            const ticker = typeof m.ticker === "string" && m.ticker.trim() ? m.ticker.trim() : null;
            const direction = typeof m.direction === "string" &&
                VALID_DIRECTIONS.includes(m.direction.toLowerCase())
                ? m.direction.toLowerCase()
                : "volatile";
            const confidence = typeof m.confidence === "number"
                ? Math.min(1, Math.max(0, m.confidence))
                : 0.5;
            const timeHorizons = Array.isArray(m.timeHorizons)
                ? m.timeHorizons
                    .filter((h) => typeof h === "string")
                    .map((h) => h.toLowerCase())
                    .filter((h) => VALID_HORIZONS.includes(h))
                : [primaryTimeHorizon];
            const rationale = typeof m.rationale === "string" ? m.rationale.trim() : "";
            affectedMarkets.push({ asset, ticker, direction, confidence, timeHorizons, rationale });
        }
    }
    const topicSlugs = Array.isArray(d.topicSlugs)
        ? d.topicSlugs.filter((s) => typeof s === "string")
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
async function generateAIEditorial(primary, related) {
    if (!(0, ai_models_1.hasAIProviderForTask)("editorialWriter") || !(0, ai_models_1.hasAIProviderForTask)("editorialExtractor")) {
        throw new Error("No AI editorial providers configured — falling back to template");
    }
    // Scrape sources and build the user message
    const userMessage = await buildUserMessage(primary, related);
    // PASS 1: Writer — natural prose, no JSON
    console.log(`[editorial] Pass 1 (writer) starting for "${primary.title.slice(0, 60)}..."`);
    const writerOutput = await runWriterPass(userMessage);
    console.log(`[editorial] Pass 1 complete — ${writerOutput.editorialBody.length} paragraphs`);
    // PASS 2: Extractor — structured metadata from the prose
    console.log(`[editorial] Pass 2 (extractor) starting...`);
    let extractorOutput;
    try {
        extractorOutput = await runExtractorPass(writerOutput, primary, related);
        console.log(`[editorial] Pass 2 complete — ${extractorOutput.tags.length} tags, ${extractorOutput.contextSnippets.length} snippets`);
    }
    catch (err) {
        // Extractor failure is non-fatal — we have the editorial, just use defaults
        console.warn("[editorial] Extractor pass failed, using defaults:", err instanceof Error ? err.message : err);
        extractorOutput = {
            tags: [primary.category.toLowerCase()],
            claim: (0, claim_extract_1.extractCanonicalClaim)({
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
    const relevantRelated = extractorOutput.relevantRelatedIndices.length > 0
        ? extractorOutput.relevantRelatedIndices
            .filter((i) => i >= 0 && i < related.length)
            .map((i) => related[i])
        : related;
    // Build the agent research pack using existing machinery
    const relatedSummaryByLink = Object.fromEntries(extractorOutput.contextSnippets.map((s) => [s.link, s.summary]));
    const agentResearch = (0, agent_swarm_1.buildAgentResearchPack)({
        primary,
        related: relevantRelated,
        fallbackClaim: extractorOutput.claim,
        primarySummary: writerOutput.editorialBody[0] || primary.description || "",
        relatedSummaryByLink,
    });
    // Extract entities from editorial text
    const entities = (0, entity_extract_1.enrichEntities)((0, entity_extract_1.extractEntities)(writerOutput.editorialBody), writerOutput.editorialBody, writerOutput.biasContext);
    const contextSnippets = extractorOutput.contextSnippets.map((s) => ({
        source: s.source,
        link: s.link,
        summary: s.summary,
    }));
    // Merge market impact: extractor JSON preferred, writer freeform fallback
    const marketImpact = extractorOutput.marketImpact
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
        generatedBy: "claude-ai",
    };
}
