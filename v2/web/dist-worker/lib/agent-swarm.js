"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentResearchPack = buildAgentResearchPack;
exports.runResearchSwarm = runResearchSwarm;
exports.detectContradictions = detectContradictions;
exports.claimPolarity = claimPolarity;
exports.subjectTokens = subjectTokens;
const entity_1 = require("./entity");
const TOKEN_STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is",
    "are", "was", "were", "be", "been", "being", "have", "has", "had", "will", "would", "could", "should",
    "may", "might", "can", "not", "no", "nor", "that", "this", "these", "those", "it", "its", "as", "into",
    "about", "over", "under", "after", "before", "between", "all", "more", "most", "other", "some", "such",
    "only", "same", "also", "what", "which", "who", "when", "where", "why", "how", "new", "latest", "live",
    "update", "story", "report", "reports", "says", "said", "say", "year", "years", "today", "yesterday",
]);
const CLAIM_ACTION_WORDS = [
    "struck", "launched", "killed", "injured", "approved", "rejected", "passed", "blocked", "won", "lost", "signed",
    "announced", "agreed", "denied", "confirmed", "filed", "charged", "sanctioned", "imposed", "attacked", "captured",
];
const CONTRADICTION_NEGATIVE = [
    "deny", "denies", "denied", "refute", "refutes", "refuted", "debunk", "debunked", "false", "fabricated", "did not",
    "didn't", "never happened", "no evidence",
];
const CONTRADICTION_POSITIVE = [
    "confirmed", "confirm", "occurred", "happened", "announced", "approved", "struck", "launched", "passed", "killed",
];
function buildAgentResearchPack(input) {
    const items = [input.primary, ...input.related];
    const variants = items.map((item) => extractClaimVariant(item));
    const canonicalClaim = chooseCanonicalClaim(variants, input.fallbackClaim);
    const summaryByLink = {
        ...(input.relatedSummaryByLink || {}),
    };
    if (input.primarySummary) {
        summaryByLink[input.primary.link] = input.primarySummary;
    }
    const evidence = buildEvidence(items, summaryByLink).slice(0, 10);
    const contradictionFlags = detectContradictions(variants).slice(0, 5);
    const sourceCount = new Set(items.map((item) => item.source)).size;
    return {
        canonicalClaim,
        claimVariants: variants.slice(0, 8),
        evidence,
        contradictionFlags,
        sourceCount,
    };
}
function runResearchSwarm(items, maxClusters = 20) {
    const trimmed = items.filter((item) => item.link && item.title).slice(0, 220);
    const clusters = clusterEmergingEvents(trimmed).slice(0, maxClusters);
    const contradictionFlags = clusters.flatMap((cluster) => cluster.contradictionFlags).slice(0, 40);
    return {
        generatedAt: new Date().toISOString(),
        scannedItems: trimmed.length,
        clusters,
        contradictionFlags,
    };
}
function clusterEmergingEvents(items) {
    if (items.length === 0)
        return [];
    const signals = items.map((item) => toSignals(item));
    const parents = items.map((_, i) => i);
    const find = (x) => {
        let node = x;
        while (parents[node] !== node) {
            parents[node] = parents[parents[node]];
            node = parents[node];
        }
        return node;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb)
            parents[rb] = ra;
    };
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            if (isLikelySameEvent(signals[i], signals[j])) {
                union(i, j);
            }
        }
    }
    const groups = new Map();
    for (let i = 0; i < items.length; i++) {
        const root = find(i);
        const arr = groups.get(root) || [];
        arr.push(i);
        groups.set(root, arr);
    }
    const clusters = [];
    for (const indices of groups.values()) {
        if (indices.length < 2)
            continue;
        const groupedItems = indices
            .map((idx) => items[idx])
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        const variants = groupedItems.map((item) => extractClaimVariant(item));
        const canonicalClaim = chooseCanonicalClaim(variants, variants[0]?.claim || groupedItems[0].title);
        const primary = groupedItems[0];
        const sourceSet = new Set(groupedItems.map((item) => item.source));
        const tags = mergeTags(groupedItems);
        const evidence = buildEvidence(groupedItems, {}).slice(0, 8);
        const contradictionFlags = detectContradictions(variants).slice(0, 3);
        const identifier = `event:${slugify(primary.title).slice(0, 64)}:${primary.category.toLowerCase()}`;
        clusters.push({
            clusterId: slugify(primary.title).slice(0, 40) || primary.category.toLowerCase(),
            entityHash: (0, entity_1.computeEntityHash)(identifier),
            title: primary.title,
            canonicalClaim,
            itemCount: groupedItems.length,
            latestPubDate: primary.pubDate,
            tags,
            sources: Array.from(sourceSet).slice(0, 12),
            evidence,
            contradictionFlags,
        });
    }
    clusters.sort((a, b) => {
        if (b.itemCount !== a.itemCount)
            return b.itemCount - a.itemCount;
        return new Date(b.latestPubDate).getTime() - new Date(a.latestPubDate).getTime();
    });
    return clusters;
}
function isLikelySameEvent(a, b) {
    const timeDiffHours = Math.abs(a.pubMs - b.pubMs) / (1000 * 60 * 60);
    if (timeDiffHours > 96)
        return false;
    const tokenJaccard = jaccard(a.tokens, b.tokens);
    const titleOverlap = overlapCount(a.titleTokens, b.titleTokens);
    const tagOverlap = overlapCount(a.tags, b.tags);
    if (titleOverlap >= 2 && tokenJaccard >= 0.14)
        return true;
    if (tagOverlap >= 2 && tokenJaccard >= 0.12)
        return true;
    return tokenJaccard >= 0.2 && titleOverlap >= 1;
}
function buildEvidence(items, summaryByLink) {
    const dedupe = new Set();
    const evidence = [];
    for (const item of items) {
        if (!item.link || dedupe.has(item.link))
            continue;
        dedupe.add(item.link);
        const summary = summaryByLink[item.link] ||
            cleanSnippet(item.description) ||
            cleanSnippet(item.title);
        evidence.push({
            kind: inferEvidenceKind(item),
            source: item.source,
            title: item.title,
            link: item.link,
            summary,
            pubDate: item.pubDate,
        });
    }
    return evidence;
}
function inferEvidenceKind(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    const link = item.link.toLowerCase();
    if (/\.(pdf|doc|docx|xls|xlsx)(\?|$)/.test(link) || /\/pdf\//.test(link)) {
        return "document";
    }
    if (/\b(data|dataset|index|poll|survey|statistics|chart)\b/.test(text)) {
        return "data";
    }
    if (/\b(report|brief|filing|court|bill|memo|audit|white paper)\b/.test(text)) {
        return "report";
    }
    return "link";
}
function extractClaimVariant(item) {
    const raw = cleanSnippet(item.title || item.description || "Claim unavailable");
    const claim = normalizeClaim(raw);
    const confidence = estimateClaimConfidence(claim, item);
    return {
        source: item.source,
        link: item.link,
        claim,
        confidence,
    };
}
function chooseCanonicalClaim(variants, fallback) {
    if (variants.length === 0)
        return normalizeClaim(fallback);
    const scored = variants.map((variant) => {
        const factualityBonus = sourceFactualityWeight(variant.source);
        return { ...variant, score: variant.confidence + factualityBonus };
    });
    scored.sort((a, b) => b.score - a.score);
    return normalizeClaim(scored[0]?.claim || fallback);
}
function sourceFactualityWeight(source) {
    const s = source.toLowerCase();
    if (s.includes("reuters") || s.includes("associated press") || s.includes("afp"))
        return 0.08;
    if (s.includes("bbc") || s.includes("npr") || s.includes("financial times") || s.includes("wall street journal"))
        return 0.05;
    return 0;
}
function estimateClaimConfidence(claim, item) {
    const lower = claim.toLowerCase();
    const words = tokenize(claim);
    const hasAction = CLAIM_ACTION_WORDS.some((w) => lower.includes(w));
    const hasNumber = /\d/.test(claim);
    const hasProperName = /[A-Z][a-z]+/.test(claim);
    const hasQuestionForm = /\?$/.test(claim);
    const hasQuote = /["'“”]/.test(item.title);
    let score = 0.42;
    score += Math.min(0.2, words.length / 60);
    if (hasAction)
        score += 0.17;
    if (hasProperName)
        score += 0.11;
    if (hasNumber)
        score += 0.05;
    if (hasQuestionForm)
        score -= 0.2;
    if (hasQuote)
        score -= 0.04;
    return Math.max(0.05, Math.min(0.99, score));
}
function detectContradictions(variants) {
    const flags = [];
    for (let i = 0; i < variants.length; i++) {
        for (let j = i + 1; j < variants.length; j++) {
            const a = variants[i];
            const b = variants[j];
            if (a.source === b.source)
                continue;
            const polarityA = claimPolarity(a.claim);
            const polarityB = claimPolarity(b.claim);
            if (polarityA === 0 || polarityB === 0 || polarityA === polarityB)
                continue;
            const overlap = overlapCount(subjectTokens(a.claim), subjectTokens(b.claim));
            if (overlap < 2)
                continue;
            const id = `${slugify(a.source)}-${slugify(b.source)}-${slugify(a.claim).slice(0, 16)}`;
            flags.push({
                id,
                sourceA: a.source,
                sourceB: b.source,
                claimA: a.claim,
                claimB: b.claim,
                reason: "Sources describe overlapping subjects with opposite polarity.",
            });
        }
    }
    return dedupeContradictions(flags).slice(0, 8);
}
function dedupeContradictions(flags) {
    const seen = new Set();
    const output = [];
    for (const flag of flags) {
        const key = [flag.sourceA, flag.sourceB, flag.claimA.slice(0, 40), flag.claimB.slice(0, 40)].sort().join("|");
        if (seen.has(key))
            continue;
        seen.add(key);
        output.push(flag);
    }
    return output;
}
function claimPolarity(claim) {
    const lower = claim.toLowerCase();
    const negHits = CONTRADICTION_NEGATIVE.filter((m) => lower.includes(m)).length;
    const posHits = CONTRADICTION_POSITIVE.filter((m) => lower.includes(m)).length;
    if (negHits > posHits && negHits > 0)
        return -1;
    if (posHits > negHits && posHits > 0)
        return 1;
    return 0;
}
function subjectTokens(text) {
    const words = tokenize(text).filter((w) => !CONTRADICTION_NEGATIVE.includes(w) && !CONTRADICTION_POSITIVE.includes(w));
    return new Set(words.filter((w) => w.length > 2));
}
function toSignals(item) {
    return {
        tokens: new Set(tokenize(`${item.title} ${item.description}`)),
        titleTokens: new Set(tokenize(item.title)),
        tags: new Set((item.tags || []).map((tag) => tag.toLowerCase())),
        pubMs: new Date(item.pubDate).getTime() || Date.now(),
    };
}
function tokenize(text) {
    return cleanSnippet(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1 && !TOKEN_STOPWORDS.has(word));
}
function overlapCount(a, b) {
    let count = 0;
    for (const value of a) {
        if (b.has(value))
            count++;
    }
    return count;
}
function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
        return 1;
    let intersection = 0;
    for (const value of a) {
        if (b.has(value))
            intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
function mergeTags(items) {
    const out = new Set();
    for (const item of items) {
        out.add(item.category.toLowerCase());
        for (const tag of item.tags || [])
            out.add(tag.toLowerCase());
    }
    return Array.from(out).slice(0, 8);
}
function normalizeClaim(text) {
    let claim = cleanSnippet(text).replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "").trim();
    claim = claim.replace(/^["'“”]+|["'“”]+$/g, "").trim();
    if (!claim)
        return "Claim unavailable.";
    if (!/[.!?]$/.test(claim))
        claim += ".";
    return claim;
}
function cleanSnippet(input) {
    return input
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
