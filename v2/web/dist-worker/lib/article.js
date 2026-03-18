"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRelatedArticles = findRelatedArticles;
exports.generateEditorial = generateEditorial;
exports.enrichArticleEmbeds = enrichArticleEmbeds;
exports.formatDateline = formatDateline;
exports.estimateReadingTime = estimateReadingTime;
const agent_swarm_1 = require("./agent-swarm");
const entity_extract_1 = require("./entity-extract");
const claim_extract_1 = require("./claim-extract");
const editorial_archive_1 = require("./editorial-archive");
const claude_editorial_1 = require("./claude-editorial");
const entity_1 = require("./entity");
const podcast_1 = require("./podcast");
const SOURCE_CONTEXT_CACHE = new Map();
const CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const CONTEXT_FETCH_TIMEOUT_MS = 4_000;
const MAX_RELATED_CONTEXT_FETCH = 3;
const ENGLISH_TRANSLATION_CACHE = new Map();
const TRANSLATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TRANSLATION_TIMEOUT_MS = 5_000;
// ============================================================================
// RELATED ARTICLE FINDER — richer matching than headline-only overlap
// ============================================================================
/**
 * Find related articles from other sources that likely cover the same story.
 * Uses weighted overlap from title+description, phrase overlap, and temporal proximity.
 */
function findRelatedArticles(target, allItems, maxResults = 5) {
    const signalFrequency = buildSignalFrequencyMap(allItems);
    const targetEntityAnchors = extractEntityAnchors(`${target.title} ${target.description ?? ""}`);
    const targetAnchorKeywords = new Set([
        ...targetEntityAnchors,
        ...extractAnchorKeywords(target.title, signalFrequency, Math.max(1, allItems.length)),
    ]);
    const targetKeywords = extractKeywords(`${target.title} ${target.description}`);
    const targetTitleKeywords = extractKeywords(target.title);
    const targetSignalKeywords = extractSignalKeywords(target.title);
    const targetSpecificSignals = extractSpecificSignalKeywords(target.title);
    const targetPhrases = extractPhrases(target.title);
    const targetTags = new Set((target.tags || []).map((tag) => tag.toLowerCase()));
    if (targetKeywords.size === 0 || targetTitleKeywords.size === 0)
        return [];
    const scored = [];
    for (const item of allItems) {
        // Don't match self, same source, or missing links.
        if (item.id === target.id)
            continue;
        if (item.source === target.source)
            continue;
        if (!item.link)
            continue;
        const itemText = `${item.title} ${item.description}`;
        const itemKeywords = extractKeywords(itemText);
        const itemTitleKeywords = extractKeywords(item.title);
        const itemEntityAnchors = extractEntityAnchors(itemText);
        const itemSignalKeywords = extractSignalKeywords(item.title);
        const itemSpecificSignals = extractSpecificSignalKeywords(item.title);
        const itemTags = new Set((item.tags || []).map((tag) => tag.toLowerCase()));
        const entityOverlap = countOverlap(targetEntityAnchors, itemEntityAnchors);
        const keywordOverlap = countOverlap(targetKeywords, itemKeywords);
        const titleKeywordOverlap = countOverlap(targetTitleKeywords, itemTitleKeywords);
        const signalOverlap = countOverlap(targetSignalKeywords, itemSignalKeywords);
        const specificSignalOverlap = countOverlap(targetSpecificSignals, itemSpecificSignals);
        const sharedTagCount = countOverlap(targetTags, itemTags);
        const anchorOverlap = countOverlap(targetAnchorKeywords, new Set([...itemSpecificSignals, ...itemSignalKeywords, ...itemEntityAnchors]));
        let phraseOverlap = 0;
        const itemTitleLower = item.title.toLowerCase();
        for (const phrase of targetPhrases) {
            if (itemTitleLower.includes(phrase))
                phraseOverlap++;
        }
        const requiresMultipleEntityMatches = targetEntityAnchors.size > 1;
        const hasStrongEntityAnchor = requiresMultipleEntityMatches
            ? entityOverlap >= 2
            : entityOverlap >= 1;
        const hasStrongAnchor = hasStrongEntityAnchor ||
            anchorOverlap > 0 ||
            specificSignalOverlap > 0 ||
            signalOverlap >= 2 ||
            phraseOverlap > 0 ||
            titleKeywordOverlap >= 2;
        if (!hasStrongAnchor)
            continue;
        if (requiresMultipleEntityMatches &&
            entityOverlap === 1 &&
            specificSignalOverlap === 0 &&
            phraseOverlap === 0) {
            continue;
        }
        if (targetEntityAnchors.size > 0 &&
            entityOverlap === 0 &&
            specificSignalOverlap < 2 &&
            phraseOverlap === 0 &&
            titleKeywordOverlap < 3) {
            continue;
        }
        if (targetAnchorKeywords.size > 0 &&
            anchorOverlap === 0 &&
            specificSignalOverlap === 0 &&
            phraseOverlap === 0 &&
            !hasStrongEntityAnchor) {
            continue;
        }
        if (targetSignalKeywords.size > 0 &&
            signalOverlap === 0 &&
            specificSignalOverlap === 0 &&
            phraseOverlap === 0) {
            continue;
        }
        if (signalOverlap === 1 &&
            specificSignalOverlap === 0 &&
            phraseOverlap === 0 &&
            titleKeywordOverlap < 2) {
            continue;
        }
        if (targetTags.size > 0 && sharedTagCount === 0 && signalOverlap === 0 && phraseOverlap === 0) {
            continue;
        }
        const overlapRatio = keywordOverlap / Math.max(1, targetKeywords.size);
        const timeDiffMs = Math.abs(new Date(item.pubDate).getTime() - new Date(target.pubDate).getTime());
        const timeDiffHours = timeDiffMs / (3600 * 1000);
        const timeScore = timeDiffHours <= 24 ? 2 :
            timeDiffHours <= 72 ? 1 :
                0;
        const weakAnchor = specificSignalOverlap === 0 && phraseOverlap === 0 && signalOverlap < 2;
        const categoryScore = item.category === target.category ? 1 : weakAnchor ? -2 : 0;
        const score = (entityOverlap * 12) +
            (anchorOverlap * 9) +
            (specificSignalOverlap * 8) +
            (signalOverlap * 4) +
            (titleKeywordOverlap * 3) +
            (phraseOverlap * 5) +
            (sharedTagCount * 2) +
            keywordOverlap +
            Math.round(overlapRatio * 2) +
            categoryScore +
            timeScore;
        const minScore = hasStrongEntityAnchor ? 10 :
            targetEntityAnchors.size > 0 ? 18 :
                anchorOverlap > 0 ? 10 :
                    targetAnchorKeywords.size > 0 ? 16 :
                        specificSignalOverlap > 0 || phraseOverlap > 0 ? 10 :
                            14;
        if (score >= minScore) {
            scored.push({ item, score });
        }
    }
    if (scored.length === 0)
        return [];
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score < 9)
        return [];
    // Keep source diversity in the final set.
    const seenSources = new Set();
    const output = [];
    for (const { item } of scored) {
        if (seenSources.has(item.source) && output.length >= maxResults)
            continue;
        output.push(item);
        seenSources.add(item.source);
        if (output.length >= maxResults)
            break;
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
const SPECIFIC_SHORT_SIGNAL_TERMS = new Set([
    "ai",
    "uk",
    "us",
    "eu",
    "dao",
    "nft",
    "btc",
    "eth",
    "zec",
    "fed",
    "sec",
    "ipo",
    "nato",
    "opec",
    "iran",
    "gaza",
    "china",
    "taiwan",
    "russia",
    "ukraine",
    "trump",
]);
const LOW_SIGNAL_TERMS = new Set([
    "people",
    "person",
    "official",
    "officials",
    "judge",
    "judges",
    "justice",
    "justices",
    "court",
    "courts",
    "supreme",
    "appeal",
    "appeals",
    "petition",
    "petitions",
    "case",
    "cases",
    "lawsuit",
    "lawsuits",
    "administration",
    "department",
    "departments",
    "agency",
    "agencies",
    "committee",
    "committees",
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
const ENTITY_STOP_WORDS = new Set([
    "judge",
    "judges",
    "justice",
    "justices",
    "court",
    "courts",
    "supreme",
    "federal",
    "state",
    "appeal",
    "appeals",
    "petition",
    "petitions",
    "suspension",
    "mental",
    "fitness",
    "administration",
    "department",
    "departments",
    "agency",
    "agencies",
    "committee",
    "committees",
    "official",
    "officials",
]);
function extractKeywords(text) {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    return new Set(words);
}
function extractEntityAnchors(text) {
    const matches = text.match(/\b[A-Z][A-Za-z0-9.'’-]{2,}\b|\b[A-Z]{2,}\b/g) || [];
    const anchors = new Set();
    for (const match of matches) {
        const normalized = match
            .toLowerCase()
            .replace(/['’]s$/i, "")
            .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
        if (normalized.length < 3)
            continue;
        if (/^\d+$/.test(normalized))
            continue;
        if (STOP_WORDS.has(normalized) || LOW_SIGNAL_TERMS.has(normalized) || ENTITY_STOP_WORDS.has(normalized)) {
            continue;
        }
        anchors.add(normalized);
    }
    return anchors;
}
function extractPhrases(text) {
    const words = Array.from(extractSignalKeywords(text));
    const phrases = new Set();
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
function extractSignalKeywords(text) {
    const base = extractKeywords(text);
    const out = new Set();
    for (const word of base) {
        if (LOW_SIGNAL_TERMS.has(word))
            continue;
        if (word.length >= 4 || SHORT_SIGNAL_TERMS.has(word)) {
            out.add(word);
        }
    }
    return out;
}
function extractSpecificSignalKeywords(text) {
    const base = extractSignalKeywords(text);
    const out = new Set();
    for (const token of base) {
        if (token.length >= 5 ||
            SPECIFIC_SHORT_SIGNAL_TERMS.has(token) ||
            token.includes("-") ||
            /\d/.test(token)) {
            out.add(token);
        }
    }
    return out;
}
function buildSignalFrequencyMap(items) {
    const frequency = new Map();
    for (const item of items) {
        const perTitle = extractSignalKeywords(item.title);
        for (const token of perTitle) {
            frequency.set(token, (frequency.get(token) ?? 0) + 1);
        }
    }
    return frequency;
}
function extractAnchorKeywords(title, signalFrequency, poolSize) {
    const anchors = new Set();
    const specific = extractSpecificSignalKeywords(title);
    const strictMaxDocCount = Math.max(2, Math.floor(poolSize * 0.04));
    for (const token of specific) {
        const seen = signalFrequency.get(token) ?? 0;
        if (seen <= strictMaxDocCount)
            anchors.add(token);
    }
    if (anchors.size > 0)
        return anchors;
    const fallback = Array.from(extractSignalKeywords(title))
        .filter((token) => token.length >= 5 && !LOW_SIGNAL_TERMS.has(token))
        .sort((a, b) => b.length - a.length);
    const fallbackMaxDocCount = Math.max(4, Math.floor(poolSize * 0.08));
    for (const token of fallback) {
        const seen = signalFrequency.get(token) ?? 0;
        if (seen <= fallbackMaxDocCount) {
            anchors.add(token);
        }
        if (anchors.size >= 2)
            break;
    }
    return anchors;
}
function countOverlap(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let overlap = 0;
    for (const value of a) {
        if (b.has(value))
            overlap++;
    }
    return overlap;
}
const inflight = new Map();
/**
 * Smart editorial generator: cache → singleflight AI → template fallback.
 *
 * 1. Check the editorial archive for a previously generated editorial
 * 2. If a generation is already in-flight for this hash, await it (singleflight)
 * 3. Try Claude AI synthesis (if ANTHROPIC_API_KEY is set)
 * 4. Fall back to template-based generation
 *
 * Returns ArticleContent with an optional `generatedBy` tag.
 */
async function generateEditorial(primary, related, options) {
    const hash = (0, entity_1.computeEntityHash)(primary.link);
    // 1. Check editorial archive cache — already generated, serve immediately
    if (!options?.skipCache) {
        try {
            const cached = await (0, editorial_archive_1.getArchivedEditorial)(hash);
            if (cached && isCachedEditorialCompatible(primary, related, cached)) {
                console.log(`[editorial] cache hit for ${hash.slice(0, 10)}...`);
                return await enrichArticleEmbeds(primary, cached);
            }
            if (cached) {
                console.log(`[editorial] cache stale for ${hash.slice(0, 10)}..., regenerating`);
            }
        }
        catch (err) {
            console.warn("[editorial] archive lookup failed:", err);
        }
    }
    // 2. Singleflight — if generation is already in-flight, wait for that result
    const existing = inflight.get(hash);
    if (existing) {
        console.log(`[editorial] singleflight: joining in-flight generation for ${hash.slice(0, 10)}...`);
        return existing;
    }
    // 3. Start new generation and register in singleflight map
    const generation = generateEditorialInner(primary, related, hash);
    inflight.set(hash, generation);
    try {
        return await generation;
    }
    finally {
        inflight.delete(hash);
    }
}
/**
 * Inner generation logic — only called once per hash thanks to singleflight.
 */
async function generateEditorialInner(primary, related, hash) {
    // Try Claude AI editorial
    try {
        const aiEditorial = await (0, claude_editorial_1.generateAIEditorial)(primary, related);
        console.log(`[editorial] AI generated for ${hash.slice(0, 10)}...`);
        return await enrichArticleEmbeds(primary, aiEditorial);
    }
    catch (err) {
        console.warn("[editorial] AI generation failed, using template:", err instanceof Error ? err.message : err);
    }
    // Fall back to template generation
    const templateResult = await generateEditorialTemplate(primary, related);
    return {
        ...(await enrichArticleEmbeds(primary, templateResult)),
        generatedBy: "template-fallback",
    };
}
async function enrichArticleEmbeds(primary, article) {
    if (article.podcastEpisode && !shouldRefreshPodcastEpisode(article.podcastEpisode)) {
        return article;
    }
    const podcastEpisode = await (0, podcast_1.extractPodcastEpisode)(primary);
    if (!podcastEpisode)
        return article;
    return {
        ...article,
        podcastEpisode,
    };
}
function shouldRefreshPodcastEpisode(episode) {
    return !episode.audioUrl && !episode.embedScriptUrl;
}
function isCachedEditorialCompatible(primary, _currentRelated, cached) {
    // Once an editorial is generated and archived, always serve it.
    // The editorial body is already written — related article rotation in the RSS
    // feed should NOT invalidate it. This prevents regeneration (and the race
    // condition where multiple tabs get different AI outputs).
    //
    // Only reject if the primary article URL somehow changed (shouldn't happen
    // since the hash is derived from it).
    if (!cached.primary?.link)
        return true;
    const normalize = (link) => {
        try {
            const u = new URL(link);
            u.hash = "";
            const removable = [
                "utm_source",
                "utm_medium",
                "utm_campaign",
                "utm_term",
                "utm_content",
                "ref",
                "ref_src",
                "fbclid",
                "gclid",
            ];
            for (const key of removable)
                u.searchParams.delete(key);
            if (u.pathname !== "/" && u.pathname.endsWith("/")) {
                u.pathname = u.pathname.replace(/\/+$/, "");
            }
            return u.toString();
        }
        catch {
            return link;
        }
    };
    return normalize(cached.primary.link) === normalize(primary.link);
}
// ============================================================================
// MARKET IMPACT FALLBACK — topic-regex heuristic when Claude is unavailable
// ============================================================================
/** Map topic slugs to market names and tickers for the template fallback. */
const TOPIC_MARKET_MAP = {
    btc: { asset: "Bitcoin", ticker: "BTC" },
    eth: { asset: "Ethereum", ticker: "ETH" },
    gold: { asset: "Gold", ticker: "XAU" },
    oil: { asset: "Crude Oil", ticker: "CL" },
    usd: { asset: "US Dollar Index", ticker: "DXY" },
    trade: { asset: "Global Trade Flows", ticker: null },
    war: { asset: "Defense & Commodities", ticker: null },
    climate: { asset: "Energy Transition", ticker: null },
    economy: { asset: "Global Macro", ticker: null },
    crypto: { asset: "Digital Assets", ticker: null },
    election: { asset: "Political Risk", ticker: null },
    ai: { asset: "AI & Semiconductor Equities", ticker: null },
    health: { asset: "Healthcare & Biotech", ticker: null },
    scandal: { asset: "Governance Risk", ticker: null },
    rights: { asset: "ESG & Social Impact", ticker: null },
};
/** Simple topic patterns mirroring TOPIC_TAXONOMY from sentiment.ts. */
const TOPIC_PATTERNS = [
    { slug: "btc", pattern: /\b(bitcoin|btc)\b/i },
    { slug: "eth", pattern: /\b(ethereum|eth(?:er)?|layer.?2|rollup|l2)\b/i },
    { slug: "gold", pattern: /\b(gold|bullion|precious\s*metal)\b/i },
    { slug: "oil", pattern: /\b(crude|oil\s*price|opec|brent|petroleum|barrel|wti)\b/i },
    { slug: "usd", pattern: /\b(dollar|fed(eral\s*reserve)?|interest\s*rate|treasury|fomc|rate\s*cut|rate\s*hike|cpi|inflation)\b/i },
    { slug: "trade", pattern: /\b(tariff|trade\s*war|sanction|export|import|embargo)\b/i },
    { slug: "war", pattern: /\b(war|invasion|airstrike|missile|troops|military|ceasefire)\b/i },
    { slug: "climate", pattern: /\b(climate|warming|carbon|emission|renewable|fossil\s*fuel)\b/i },
    { slug: "economy", pattern: /\b(economy|gdp|recession|growth|unemployment|market)\b/i },
    { slug: "crypto", pattern: /\b(crypto|blockchain|defi|nft|web3|token|stablecoin|dao)\b/i },
    { slug: "election", pattern: /\b(election|ballot|voter|campaign|candidate|referendum)\b/i },
    { slug: "ai", pattern: /\b(ai|artificial\s*intelligence|machine\s*learning|llm|openai|chatgpt)\b/i },
    { slug: "health", pattern: /\b(health|vaccine|pandemic|disease|hospital|outbreak)\b/i },
    { slug: "scandal", pattern: /\b(scandal|corruption|fraud|indictment|bribery)\b/i },
];
/**
 * Generate a best-effort market impact analysis using topic regex matching.
 * Used as a fallback when Claude AI is unavailable.
 * Returns null if no topics match.
 */
function generateFallbackMarketImpact(primary, related) {
    const textPool = [
        primary.title,
        primary.description,
        ...related.map((r) => r.title),
        ...related.map((r) => r.description),
    ].filter(Boolean).join(" ");
    const matchedSlugs = [];
    for (const { slug, pattern } of TOPIC_PATTERNS) {
        if (pattern.test(textPool)) {
            matchedSlugs.push(slug);
        }
    }
    if (matchedSlugs.length === 0)
        return null;
    const affectedMarkets = matchedSlugs.slice(0, 5).map((slug) => {
        const m = TOPIC_MARKET_MAP[slug] || { asset: slug, ticker: null };
        return {
            asset: m.asset,
            ticker: m.ticker,
            direction: "volatile",
            confidence: 0.3,
            timeHorizons: ["days"],
            rationale: `Topic "${slug}" detected in article text via keyword matching.`,
        };
    });
    return {
        significance: Math.min(50, 15 + matchedSlugs.length * 10),
        headline: `Potential exposure across ${matchedSlugs.length} topic${matchedSlugs.length > 1 ? "s" : ""} detected via keyword analysis.`,
        primaryTimeHorizon: "days",
        affectedMarkets,
        topicSlugs: matchedSlugs,
        transmissionMechanism: null,
    };
}
/**
 * Template-based editorial generation (original implementation).
 * Pulls extra context from source pages (with timeout/fallback), rewrites into
 * concise summaries, and avoids duplicate/recycled paragraph text.
 */
async function generateEditorialTemplate(primary, related) {
    const storyContext = await buildStoryContext(primary, related);
    const lang = detectLanguageProfile(primary, storyContext);
    const claim = (0, claim_extract_1.extractCanonicalClaim)({
        seedClaim: primary.canonicalClaim,
        title: primary.title,
        description: primary.description,
        contextSummary: storyContext.primarySummary,
        url: primary.link,
    });
    const subheadline = generateSubheadline(primary, storyContext, lang);
    const editorialBody = generateEditorialBody(primary, storyContext, lang);
    const wireSummary = generateWireSummary(storyContext);
    const biasContext = generateBiasContext(primary, related);
    const tags = deriveTags(primary, storyContext);
    const relatedSummaryByLink = Object.fromEntries(storyContext.relatedSnippets.map((snippet) => [snippet.link, snippet.summary]));
    const agentResearch = (0, agent_swarm_1.buildAgentResearchPack)({
        primary,
        related,
        fallbackClaim: claim,
        primarySummary: storyContext.primarySummary,
        relatedSummaryByLink,
    });
    // Extract and enrich entities from editorial text
    const entities = (0, entity_extract_1.enrichEntities)((0, entity_extract_1.extractEntities)(editorialBody), editorialBody, biasContext);
    let subheadlineEnglish = null;
    let editorialBodyEnglish;
    if (lang.isNonLatinHeavy) {
        const translated = await translateBlocksToEnglish([subheadline, ...editorialBody]);
        subheadlineEnglish = translated[0] || null;
        editorialBodyEnglish = translated.slice(1);
    }
    // Generate fallback market impact from topic regex matching
    const marketImpact = generateFallbackMarketImpact(primary, related);
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
        entities,
        marketImpact,
    };
}
async function buildStoryContext(primary, related) {
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
async function getContextSummaryForItem(item) {
    const fallback = rewriteAsBrief(item.description || item.title);
    if (!item.link)
        return fallback;
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
async function fetchSourceSummary(url, targetKeywords) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONTEXT_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "PooterWorld/1.0 (+https://pooter.world)",
            },
        });
        if (!res.ok)
            return null;
        const contentType = res.headers.get("content-type") || "";
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
            return null;
        }
        const html = await res.text();
        const candidates = collectSummaryCandidates(html);
        if (candidates.length === 0)
            return null;
        candidates.sort((a, b) => scoreCandidate(b, targetKeywords) - scoreCandidate(a, targetKeywords));
        return candidates[0] || null;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
function collectSummaryCandidates(html) {
    const candidates = [];
    candidates.push(...extractMetaDescriptions(html));
    candidates.push(...extractJsonLdDescriptions(html));
    candidates.push(...extractParagraphs(html));
    return dedupeStrings(candidates)
        .map((text) => cleanSnippet(text))
        .filter((text) => text.length >= 60)
        .slice(0, 24);
}
function extractMetaDescriptions(html) {
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    const keys = ["description", "og:description", "twitter:description"];
    const out = [];
    for (const tag of metaTags) {
        const lower = tag.toLowerCase();
        const hasKey = keys.some((key) => lower.includes(`name=\"${key}\"`) ||
            lower.includes(`name='${key}'`) ||
            lower.includes(`property=\"${key}\"`) ||
            lower.includes(`property='${key}'`));
        if (!hasKey)
            continue;
        const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
        if (contentMatch?.[1]) {
            out.push(contentMatch[1]);
        }
    }
    return out;
}
function extractJsonLdDescriptions(html) {
    const out = [];
    const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of matches) {
        const raw = cleanSnippet(match[1] || "");
        if (!raw)
            continue;
        try {
            const parsed = JSON.parse(raw);
            collectTextFromJsonLd(parsed, out);
        }
        catch {
            // Ignore invalid json-ld chunks.
        }
    }
    return out;
}
function collectTextFromJsonLd(node, out) {
    if (!node)
        return;
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
    if (typeof node !== "object")
        return;
    for (const [key, value] of Object.entries(node)) {
        const normalizedKey = key.toLowerCase();
        if ((normalizedKey === "description" ||
            normalizedKey === "articlebody" ||
            normalizedKey === "headline") &&
            typeof value === "string") {
            const text = cleanSnippet(value);
            if (text.length >= 60) {
                out.push(text);
            }
            continue;
        }
        collectTextFromJsonLd(value, out);
    }
}
function extractParagraphs(html) {
    const withoutScripts = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const paragraphs = withoutScripts.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
    const out = [];
    for (const p of paragraphs) {
        const cleaned = cleanSnippet(p[1] || "");
        if (cleaned.length >= 60 && cleaned.length <= 420) {
            out.push(cleaned);
        }
        if (out.length >= 20)
            break;
    }
    return out;
}
function scoreCandidate(text, targetKeywords) {
    const words = extractKeywords(text);
    let overlap = 0;
    for (const w of targetKeywords) {
        if (words.has(w))
            overlap++;
    }
    const sentenceLikeBonus = /[.!?]$/.test(text) ? 1 : 0;
    const lengthCenter = 170;
    const lengthPenalty = Math.abs(text.length - lengthCenter) / lengthCenter;
    return (overlap * 4) + sentenceLikeBonus - lengthPenalty;
}
function isContextSnippetRelevant(summary, primaryAnchorTerms) {
    if (primaryAnchorTerms.size === 0)
        return true;
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
function generateSubheadline(primary, context, lang) {
    if (lang.isNonLatinHeavy) {
        return truncateWords(context.primarySummary, lang.isCjk ? 36 : 20);
    }
    const titleTerms = extractTopTerms(primary.title, 4);
    const terms = (titleTerms.length > 0 ? titleTerms : context.keyTerms).slice(0, 3);
    const termPart = terms.length >= 2 ? `${terms[0]} and ${terms[1]}` :
        terms.length === 1 ? terms[0] :
            primary.category.toLowerCase();
    const corroborators = context.relatedSnippets.slice(0, 2).map((s) => s.source);
    const corroboration = corroborators.length === 0
        ? ""
        : corroborators.length === 1
            ? ` Cross-checked against ${corroborators[0]}.`
            : ` Cross-checked against ${corroborators[0]} and ${corroborators[1]}.`;
    return `${primary.source} focuses on ${termPart}, with context pulled from source reporting instead of recycled feed copy.${corroboration}`;
}
function generateEditorialBody(primary, context, lang) {
    const paragraphs = [];
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
        const watchline = watchTerms.length === 1
            ? `What to watch next: movement around ${watchTerms[0]}.`
            : `What to watch next: movement around ${watchTerms.join(", ")}.`;
        paragraphs.push(watchline);
    }
    return dedupeParagraphs(paragraphs).slice(0, 4);
}
function generateWireSummary(context) {
    if (context.relatedSnippets.length === 0)
        return null;
    return context.relatedSnippets
        .slice(0, 3)
        .map((snippet) => `${snippet.source}: ${truncateWords(snippet.summary, 18)}`)
        .join(" | ");
}
// ============================================================================
// BIAS CONTEXT
// ============================================================================
function generateBiasContext(primary, related) {
    const bias = primary.bias;
    if (!bias)
        return null;
    const biasDescriptions = {
        "far-left": "well to the left of centre",
        "left": "from a left-leaning editorial position",
        "lean-left": "with a slight leftward lean",
        "center": "from a centrist position",
        "lean-right": "with a slight rightward lean",
        "right": "from a right-leaning editorial position",
        "far-right": "well to the right of centre",
    };
    const factDescriptions = {
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
        .map((r) => ({ source: r.source, bias: r.bias.bias }));
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
const TAG_KEYWORDS = {
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
function deriveTags(item, context) {
    const text = [
        item.title,
        item.description,
        context.primarySummary,
        ...context.relatedSnippets.map((s) => s.summary),
    ]
        .join(" ")
        .toLowerCase();
    const tags = [item.category.toLowerCase()];
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
function containsKeyword(text, keyword) {
    if (!keyword)
        return false;
    if (keyword.includes(" ")) {
        return text.includes(keyword);
    }
    const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
    return pattern.test(text);
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// ============================================================================
// TEXT HELPERS
// ============================================================================
function cleanSnippet(input) {
    return decodeHtmlEntities(input
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim());
}
function decodeHtmlEntities(text) {
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
function dedupeStrings(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const normalized = normalizeForDedup(value);
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(value);
    }
    return out;
}
function normalizeForDedup(text) {
    return text
        .toLowerCase()
        // Keep Unicode letters/numbers so CJK and other non-Latin text can dedupe safely.
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
}
function rewriteAsBrief(text) {
    const cleaned = cleanSnippet(text);
    if (!cleaned)
        return "";
    const sentences = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 40);
    if (sentences.length === 0) {
        return truncateWords(cleaned, 30);
    }
    const first = truncateWords(sentences[0], 26);
    const second = sentences.find((s) => !isNearDuplicateSentence(s, first));
    if (!second)
        return first;
    return `${first} ${truncateWords(second, 18)}`;
}
function isNearDuplicateSentence(a, b) {
    const na = normalizeForDedup(a);
    const nb = normalizeForDedup(b);
    if (!na || !nb)
        return true;
    if (na === nb)
        return true;
    if (na.startsWith(nb.slice(0, 80)) || nb.startsWith(na.slice(0, 80)))
        return true;
    const aWords = new Set(na.split(" ").filter(Boolean));
    const bWords = new Set(nb.split(" ").filter(Boolean));
    let overlap = 0;
    for (const word of aWords) {
        if (bWords.has(word))
            overlap++;
    }
    const minSize = Math.max(1, Math.min(aWords.size, bWords.size));
    return overlap / minSize >= 0.8;
}
function extractTopTerms(text, maxTerms) {
    const counts = new Map();
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, " ")
        .split(/\s+/)
        .filter((w) => {
        if (!w)
            return false;
        if (STOP_WORDS.has(w) || LOW_SIGNAL_TERMS.has(w))
            return false;
        if (w.length >= 4)
            return true;
        return SHORT_SIGNAL_TERMS.has(w);
    });
    for (const word of words) {
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => {
        if (b[1] !== a[1])
            return b[1] - a[1];
        return b[0].length - a[0].length;
    })
        .slice(0, maxTerms)
        .map(([word]) => word);
}
function dedupeParagraphs(paragraphs) {
    const seen = new Set();
    const out = [];
    for (const paragraph of paragraphs) {
        const key = normalizeForDedup(paragraph);
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(paragraph);
    }
    return out;
}
function toLowerStart(text) {
    if (!text)
        return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
}
function truncateWords(text, maxWords) {
    if (containsCjk(text)) {
        if (text.length <= maxWords)
            return text;
        return `${text.slice(0, maxWords)}...`;
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords)
        return text;
    return `${words.slice(0, maxWords).join(" ")}...`;
}
function detectLanguageProfile(primary, context) {
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
function containsCjk(text) {
    return /[\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FFF]/.test(text);
}
async function translateBlocksToEnglish(texts) {
    const translated = await Promise.all(texts.map((text) => translateToEnglish(text)));
    return translated.map((value, index) => value || texts[index]);
}
async function translateToEnglish(input) {
    const text = cleanSnippet(input);
    if (!text)
        return null;
    if (!/[^\x00-\x7F]/.test(text))
        return text;
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
        if (!res.ok)
            return null;
        const data = await res.json();
        const translated = parseGoogleTranslatePayload(data);
        if (!translated)
            return null;
        ENGLISH_TRANSLATION_CACHE.set(text, {
            text: translated,
            expiresAt: now + TRANSLATION_CACHE_TTL_MS,
        });
        return translated;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
function parseGoogleTranslatePayload(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[0]))
        return null;
    const chunks = payload[0];
    const out = [];
    for (const chunk of chunks) {
        if (!Array.isArray(chunk))
            continue;
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
function formatDateline(dateStr) {
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
function estimateReadingTime(texts) {
    const totalWords = texts.join(" ").split(/\s+/).length;
    return Math.max(1, Math.ceil(totalWords / 200));
}
