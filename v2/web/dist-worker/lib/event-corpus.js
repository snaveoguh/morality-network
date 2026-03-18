"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEventCorpus = buildEventCorpus;
exports.computeEventShapedSentimentSnapshot = computeEventShapedSentimentSnapshot;
exports.computeEventShapedSentimentSnapshotFromFeeds = computeEventShapedSentimentSnapshotFromFeeds;
const entity_1 = require("./entity");
const crawl_queue_1 = require("./crawl-queue");
const sentiment_1 = require("./sentiment");
const source_registry_1 = require("./source-registry");
const ai_sentiment_1 = require("./ai-sentiment");
const EVENT_STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "for",
    "in",
    "on",
    "at",
    "by",
    "from",
    "with",
    "after",
    "before",
    "amid",
    "over",
    "under",
    "into",
    "says",
    "say",
    "said",
    "report",
    "reports",
    "reportedly",
    "news",
    "live",
    "latest",
    "today",
    "yesterday",
    "world",
    "new",
]);
function normalizeClaim(value) {
    const tokens = value
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter((token) => token.length > 2 && !EVENT_STOPWORDS.has(token));
    return Array.from(new Set(tokens)).sort().slice(0, 10).join(" ");
}
function eventClaimForItem(item) {
    const preferred = item.canonicalClaim &&
        item.canonicalClaim !== "Claim unavailable."
        ? item.canonicalClaim
        : item.title;
    return preferred.trim() || item.title.trim() || "Untitled event";
}
function latestFirst(a, b) {
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
}
function buildSentimentItem(event) {
    const sortedItems = [...event.items].sort(latestFirst);
    const primary = sortedItems[0];
    const descriptionParts = sortedItems
        .slice(0, 3)
        .map((item) => item.description?.trim())
        .filter(Boolean);
    return {
        ...primary,
        id: event.id,
        title: event.title,
        link: event.link,
        pubDate: event.pubDate,
        description: descriptionParts.join(" ").trim() || event.canonicalClaim,
        canonicalClaim: event.canonicalClaim,
        sourceNames: event.sourceNames,
        rawArticleCount: event.articleCount,
        eventHash: event.id,
    };
}
function priorityForEvent(event) {
    return Math.min(95, 45 + event.sourceCount * 8 + event.articleCount * 3);
}
function buildEventCorpus(items) {
    const registry = (0, source_registry_1.getCanonicalSourceRegistry)();
    (0, crawl_queue_1.seedCrawlQueueFromRegistry)(registry);
    const groups = new Map();
    for (const item of items) {
        const canonicalClaim = eventClaimForItem(item);
        const normalized = normalizeClaim(`${canonicalClaim} ${item.title}`) ||
            normalizeClaim(canonicalClaim) ||
            normalizeClaim(item.title);
        if (!normalized)
            continue;
        const key = (0, entity_1.computeEntityHash)(`event:${normalized}`);
        const bucket = groups.get(key) || [];
        bucket.push(item);
        groups.set(key, bucket);
    }
    const events = Array.from(groups.entries()).map(([id, groupedItems]) => {
        const sortedItems = [...groupedItems].sort(latestFirst);
        const primary = sortedItems[0];
        const sourceNames = (0, source_registry_1.extractSourceNames)(sortedItems);
        const linkSet = new Set();
        for (const item of sortedItems) {
            if (item.link)
                linkSet.add(item.link);
        }
        return {
            id: id,
            canonicalClaim: eventClaimForItem(primary),
            title: primary.title,
            link: primary.link,
            pubDate: primary.pubDate,
            category: primary.category,
            articleCount: linkSet.size || sortedItems.length,
            sourceCount: sourceNames.length,
            sourceNames,
            items: sortedItems,
        };
    });
    events.sort((a, b) => {
        if (b.sourceCount !== a.sourceCount)
            return b.sourceCount - a.sourceCount;
        if (b.articleCount !== a.articleCount)
            return b.articleCount - a.articleCount;
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });
    for (const event of events.slice(0, 250)) {
        const representative = event.items[0];
        const source = (0, source_registry_1.resolveCanonicalSource)({
            sourceName: representative.source,
            sourceUrl: representative.sourceUrl,
            articleUrl: representative.link,
        });
        if (representative.link) {
            (0, crawl_queue_1.enqueueCrawlTarget)({
                url: representative.link,
                kind: "event-article",
                sourceId: source?.id ?? null,
                eventId: event.id,
                priority: priorityForEvent(event),
                discoveredFrom: event.canonicalClaim,
            });
        }
    }
    const queueStats = (0, crawl_queue_1.getCrawlQueueStats)();
    return {
        generatedAt: new Date().toISOString(),
        rawArticleCount: items.length,
        eventCount: events.length,
        sourceRegistrySize: registry.length,
        queuedCrawlTargets: queueStats.queued,
        events,
        sentimentItems: events.map(buildSentimentItem),
    };
}
function enrichTopicCounts(snapshot, corpus) {
    return snapshot.topics.map((topic) => {
        const matchingEvents = corpus.events.filter((event) => (0, sentiment_1.matchesTopicDefinition)({
            title: event.title,
            description: event.canonicalClaim,
        }, sentiment_1.TOPIC_TAXONOMY.find((candidate) => candidate.slug === topic.slug)));
        const rawArticleCount = matchingEvents.reduce((sum, event) => sum + event.articleCount, 0);
        const sourceNames = new Set();
        for (const event of matchingEvents) {
            for (const sourceName of event.sourceNames) {
                sourceNames.add(sourceName);
            }
        }
        return {
            ...topic,
            eventCount: matchingEvents.length,
            articleCount: rawArticleCount,
            sourceCount: sourceNames.size,
            topSources: Array.from(sourceNames).slice(0, 5),
        };
    });
}
async function computeEventShapedSentimentSnapshot(items, marketData, previousSnapshot) {
    const corpus = buildEventCorpus(items);
    // Fetch Claude AI scores (batched, cached 30 min, falls back to null)
    const aiScores = await (0, ai_sentiment_1.computeAISentimentScores)(corpus.sentimentItems, sentiment_1.TOPIC_TAXONOMY);
    const baseSnapshot = (0, sentiment_1.computeSentimentSnapshot)(corpus.sentimentItems, marketData, previousSnapshot, aiScores);
    return {
        ...baseSnapshot,
        topics: enrichTopicCounts(baseSnapshot, corpus),
        corpusMode: "event",
        eventCount: corpus.eventCount,
        rawArticleCount: corpus.rawArticleCount,
        sourceRegistrySize: corpus.sourceRegistrySize,
        queuedCrawlTargets: corpus.queuedCrawlTargets,
    };
}
async function computeEventShapedSentimentSnapshotFromFeeds(items, previousSnapshot) {
    const marketData = await (0, sentiment_1.fetchMarketData)();
    return await computeEventShapedSentimentSnapshot(items, marketData, previousSnapshot);
}
