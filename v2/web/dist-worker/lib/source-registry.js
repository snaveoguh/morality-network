"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCanonicalSourceRegistry = getCanonicalSourceRegistry;
exports.resolveCanonicalSource = resolveCanonicalSource;
exports.registryStats = registryStats;
exports.extractSourceNames = extractSourceNames;
const bias_1 = require("./bias");
const evidence_verify_1 = require("./evidence-verify");
const rss_1 = require("./rss");
const COMMUNITY_SOURCES = [
    {
        id: "reddit",
        name: "Reddit",
        category: "Community",
        kind: "community",
        homepageUrl: "https://www.reddit.com",
        feedUrls: [],
        crawlSeedUrls: ["https://www.reddit.com"],
        domains: ["reddit.com", "www.reddit.com"],
        bias: (0, bias_1.getSourceBias)("reddit.com") ?? null,
        active: true,
    },
    {
        id: "4chan",
        name: "4chan",
        category: "Community",
        kind: "community",
        homepageUrl: "https://boards.4chan.org",
        feedUrls: [],
        crawlSeedUrls: ["https://boards.4chan.org"],
        domains: ["boards.4chan.org", "4chan.org", "4cdn.org"],
        bias: (0, bias_1.getSourceBias)("4chan.org") ?? null,
        active: true,
    },
];
let registryCache = null;
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function safeUrl(raw) {
    const normalized = (0, evidence_verify_1.normalizeUrl)(raw);
    if (!normalized)
        return null;
    try {
        return new URL(normalized);
    }
    catch {
        return null;
    }
}
function deriveHomepageUrl(raw) {
    const parsed = safeUrl(raw);
    if (!parsed)
        return raw;
    return `${parsed.protocol}//${parsed.host}`;
}
function deriveSourceKind(source) {
    const lowerName = source.name.toLowerCase();
    const lowerCategory = source.category.toLowerCase();
    if (lowerName.includes("reuters") ||
        lowerName.includes("associated press") ||
        lowerName.includes("ap ") ||
        lowerName.includes("afp") ||
        lowerName.includes("un news") ||
        lowerName.includes("who news")) {
        return "wire";
    }
    if (lowerCategory.includes("governance") ||
        lowerName.includes("parliament") ||
        lowerName.includes("world bank") ||
        lowerName.includes("imf") ||
        lowerName.includes("oecd") ||
        lowerName.includes("gao") ||
        lowerName.includes("cbo")) {
        return "institution";
    }
    if (lowerName.includes("substack") ||
        lowerName.includes("reason") ||
        lowerName.includes("spectator") ||
        lowerName.includes("jacobin") ||
        lowerName.includes("canary")) {
        return "analysis";
    }
    return "newsroom";
}
function appendUnique(target, values) {
    for (const value of values) {
        if (!value)
            continue;
        if (!target.includes(value))
            target.push(value);
    }
}
function mergeFeedSource(map, source) {
    const id = slugify(source.name);
    const existing = map.get(id);
    const feedUrl = (0, evidence_verify_1.normalizeUrl)(source.url);
    const fallbackUrl = source.fallbackUrl ? (0, evidence_verify_1.normalizeUrl)(source.fallbackUrl) : "";
    const feedHost = safeUrl(feedUrl)?.host ?? null;
    const fallbackHost = fallbackUrl ? safeUrl(fallbackUrl)?.host ?? null : null;
    const homepageUrl = deriveHomepageUrl(feedUrl);
    const bias = (0, bias_1.getSourceBias)(source.name) ||
        (0, bias_1.getSourceBias)(feedUrl) ||
        (feedHost ? (0, bias_1.getSourceBias)(feedHost) : null) ||
        null;
    if (existing) {
        appendUnique(existing.feedUrls, [feedUrl, fallbackUrl || undefined]);
        appendUnique(existing.crawlSeedUrls, [
            homepageUrl,
            feedUrl,
            fallbackUrl || undefined,
        ]);
        appendUnique(existing.domains, [feedHost || undefined, fallbackHost || undefined]);
        if (!existing.bias && bias) {
            existing.bias = bias;
        }
        return;
    }
    map.set(id, {
        id,
        name: source.name,
        category: source.category,
        kind: deriveSourceKind(source),
        homepageUrl,
        feedUrls: [feedUrl].filter(Boolean),
        crawlSeedUrls: [homepageUrl, feedUrl, fallbackUrl].filter(Boolean),
        domains: [feedHost, fallbackHost].filter(Boolean),
        bias,
        active: true,
    });
}
function getCanonicalSourceRegistry() {
    if (registryCache)
        return registryCache;
    const merged = new Map();
    for (const source of rss_1.DEFAULT_FEEDS) {
        mergeFeedSource(merged, source);
    }
    for (const source of COMMUNITY_SOURCES) {
        merged.set(source.id, source);
    }
    registryCache = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
    return registryCache;
}
function resolveCanonicalSource(input) {
    const registry = getCanonicalSourceRegistry();
    const byName = input.sourceName?.trim().toLowerCase() || "";
    const hosts = [input.sourceUrl, input.articleUrl]
        .map((value) => (value ? safeUrl(value)?.host?.toLowerCase() ?? "" : ""))
        .filter(Boolean);
    for (const source of registry) {
        if (byName && source.name.toLowerCase() === byName) {
            return source;
        }
    }
    for (const host of hosts) {
        const match = registry.find((source) => source.domains.some((domain) => host === domain.toLowerCase()));
        if (match)
            return match;
    }
    return null;
}
function registryStats() {
    const registry = getCanonicalSourceRegistry();
    return {
        total: registry.length,
        active: registry.filter((source) => source.active).length,
        crawlable: registry.filter((source) => source.crawlSeedUrls.length > 0).length,
    };
}
function extractSourceNames(items) {
    const names = new Set();
    for (const item of items) {
        const source = resolveCanonicalSource({
            sourceName: item.source,
            sourceUrl: item.sourceUrl,
            articleUrl: item.link,
        });
        names.add(source?.name || item.source);
    }
    return Array.from(names);
}
