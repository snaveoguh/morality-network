"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueCrawlTarget = enqueueCrawlTarget;
exports.seedCrawlQueueFromRegistry = seedCrawlQueueFromRegistry;
exports.reserveCrawlBatch = reserveCrawlBatch;
exports.completeCrawlTarget = completeCrawlTarget;
exports.failCrawlTarget = failCrawlTarget;
exports.getCrawlQueueSnapshot = getCrawlQueueSnapshot;
exports.getCrawlQueueStats = getCrawlQueueStats;
require("server-only");
const node_path_1 = __importDefault(require("node:path"));
const entity_1 = require("./entity");
const core_1 = require("./agents/core");
const evidence_verify_1 = require("./evidence-verify");
const CRAWL_QUEUE_PATH = process.env.CRAWL_QUEUE_PATH ||
    node_path_1.default.join("/tmp", "pooter-crawl-queue.json");
const LEASE_MS = 5 * 60 * 1000;
const crawlQueueStore = new core_1.Store({
    persistPath: CRAWL_QUEUE_PATH,
    maxItems: 8000,
    keyFn: (entry) => entry.id,
});
function makeQueueId(kind, normalizedUrl, sourceId, eventId) {
    return (0, entity_1.computeEntityHash)(`${kind}:${sourceId || "unknown"}:${eventId || "none"}:${normalizedUrl}`);
}
function nowMs() {
    return Date.now();
}
function requeueExpired(entries) {
    const now = nowMs();
    return entries.map((entry) => {
        if (entry.status === "processing" &&
            entry.lastAttemptAt &&
            now - entry.lastAttemptAt > LEASE_MS) {
            const reset = {
                ...entry,
                status: "queued",
                lastError: entry.lastError || "Lease expired before completion",
            };
            crawlQueueStore.add(reset);
            return reset;
        }
        return entry;
    });
}
function enqueueCrawlTarget(input) {
    const normalizedUrl = (0, evidence_verify_1.normalizeUrl)(input.url);
    if (!normalizedUrl)
        return null;
    const id = makeQueueId(input.kind, normalizedUrl, input.sourceId ?? null, input.eventId ?? null);
    const existing = crawlQueueStore.get(id);
    const merged = {
        id,
        url: normalizedUrl,
        kind: input.kind,
        sourceId: input.sourceId ?? null,
        eventId: input.eventId ?? null,
        priority: Math.max(existing?.priority ?? 0, input.priority ?? 50),
        status: existing?.status === "completed" ? "completed" : existing?.status ?? "queued",
        attempts: existing?.attempts ?? 0,
        enqueuedAt: existing?.enqueuedAt ?? nowMs(),
        lastAttemptAt: existing?.lastAttemptAt ?? null,
        completedAt: existing?.completedAt ?? null,
        lastError: existing?.lastError ?? null,
        discoveredFrom: input.discoveredFrom ?? existing?.discoveredFrom ?? null,
    };
    crawlQueueStore.add(merged);
    return merged;
}
function seedCrawlQueueFromRegistry(sources) {
    let count = 0;
    for (const source of sources) {
        const seeds = [
            { url: source.homepageUrl, kind: "source-home", priority: 35 },
            ...source.feedUrls.map((url) => ({
                url,
                kind: "source-feed",
                priority: 20,
            })),
        ];
        for (const seed of seeds) {
            const added = enqueueCrawlTarget({
                url: seed.url,
                kind: seed.kind,
                sourceId: source.id,
                priority: seed.priority,
                discoveredFrom: source.name,
            });
            if (added)
                count++;
        }
    }
    return count;
}
function reserveCrawlBatch(limit = 25) {
    const refreshed = requeueExpired(crawlQueueStore.getAll());
    const candidates = refreshed
        .filter((entry) => entry.status === "queued")
        .sort((a, b) => {
        if (b.priority !== a.priority)
            return b.priority - a.priority;
        return a.enqueuedAt - b.enqueuedAt;
    })
        .slice(0, limit);
    const leased = candidates.map((entry) => {
        const next = {
            ...entry,
            status: "processing",
            attempts: entry.attempts + 1,
            lastAttemptAt: nowMs(),
        };
        crawlQueueStore.add(next);
        return next;
    });
    return leased;
}
function completeCrawlTarget(id) {
    const entry = crawlQueueStore.get(id);
    if (!entry)
        return null;
    const next = {
        ...entry,
        status: "completed",
        completedAt: nowMs(),
        lastError: null,
    };
    crawlQueueStore.add(next);
    return next;
}
function failCrawlTarget(id, error) {
    const entry = crawlQueueStore.get(id);
    if (!entry)
        return null;
    const next = {
        ...entry,
        status: "failed",
        lastError: error,
    };
    crawlQueueStore.add(next);
    return next;
}
function getCrawlQueueSnapshot(limit = 100) {
    return requeueExpired(crawlQueueStore.getAll())
        .sort((a, b) => {
        if (a.status !== b.status)
            return a.status.localeCompare(b.status);
        if (b.priority !== a.priority)
            return b.priority - a.priority;
        return b.enqueuedAt - a.enqueuedAt;
    })
        .slice(0, limit);
}
function getCrawlQueueStats() {
    const items = requeueExpired(crawlQueueStore.getAll());
    const stats = {
        total: items.length,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
    };
    for (const entry of items) {
        stats[entry.status] += 1;
    }
    return stats;
}
