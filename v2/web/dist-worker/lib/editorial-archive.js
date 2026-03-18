"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getArchivedEditorial = getArchivedEditorial;
exports.saveEditorial = saveEditorial;
exports.markOnchain = markOnchain;
exports.getAllEditorialHashes = getAllEditorialHashes;
exports.listRecentMarketImpactRecords = listRecentMarketImpactRecords;
exports.computeContentHash = computeContentHash;
require("server-only");
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const viem_1 = require("viem");
const indexer_backend_1 = require("./server/indexer-backend");
const ARCHIVE_FILE_PATH = node_path_1.default.join(process.cwd(), "src/data/editorial-archive.json");
const EMPTY_ARCHIVE = {
    version: 1,
    updatedAt: "",
    items: {},
};
let cache = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 30_000;
async function fetchRemoteArchivedEditorial(hash) {
    const payload = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/archive/editorials/${hash}`, { timeoutMs: 20_000 });
    return payload.editorial ?? null;
}
async function saveRemoteEditorial(hash, editorial, generatedBy) {
    await (0, indexer_backend_1.fetchIndexerJson)("/api/v1/archive/editorials/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash, editorial, generatedBy }),
        timeoutMs: 30_000,
    });
}
async function markRemoteEditorialOnchain(hash, txHash) {
    await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/archive/editorials/${hash}/mark-onchain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash }),
        timeoutMs: 20_000,
    });
}
async function fetchRemoteEditorialHashes(limit = 100_000) {
    const payload = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/archive/editorials/hashes?limit=${Math.max(1, limit)}`, { timeoutMs: 20_000 });
    return new Set(Array.isArray(payload.hashes) ? payload.hashes : []);
}
async function fetchRemoteMarketImpactRecords(limit = 200) {
    const payload = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/archive/editorials/market-impact?limit=${Math.max(1, limit)}`, { timeoutMs: 20_000 });
    return Array.isArray(payload.records) ? payload.records : [];
}
async function loadArchive() {
    const now = Date.now();
    if (cache && now - cacheLoadedAtMs < CACHE_TTL_MS) {
        return cache;
    }
    try {
        const raw = await (0, promises_1.readFile)(ARCHIVE_FILE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !parsed.items) {
            cache = { ...EMPTY_ARCHIVE };
        }
        else {
            cache = {
                version: 1,
                updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
                items: parsed.items,
            };
        }
    }
    catch {
        cache = { ...EMPTY_ARCHIVE };
    }
    cacheLoadedAtMs = now;
    return cache;
}
let saveInFlight = false;
async function persistArchive(archive) {
    if (saveInFlight)
        return;
    try {
        saveInFlight = true;
        const dir = node_path_1.default.dirname(ARCHIVE_FILE_PATH);
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(ARCHIVE_FILE_PATH, JSON.stringify(archive, null, 2), "utf8");
    }
    finally {
        saveInFlight = false;
    }
}
/**
 * Compute a deterministic content hash for an editorial.
 * Used for onchain verification — keccak256 of the editorial body + metadata.
 */
function computeContentHash(editorial) {
    const payload = JSON.stringify({
        claim: editorial.claim,
        subheadline: editorial.subheadline,
        editorialBody: editorial.editorialBody,
        wireSummary: editorial.wireSummary,
        biasContext: editorial.biasContext,
        tags: editorial.tags,
        primaryTitle: editorial.primary.title,
        primaryLink: editorial.primary.link,
        marketImpact: editorial.marketImpact || null,
        podcastEpisode: editorial.podcastEpisode || null,
    });
    return (0, viem_1.keccak256)((0, viem_1.toBytes)(payload));
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Look up a cached editorial by entity hash.
 */
async function getArchivedEditorial(hash) {
    if ((0, indexer_backend_1.getIndexerBackendUrl)()) {
        try {
            return await fetchRemoteArchivedEditorial(hash);
        }
        catch (err) {
            console.warn("[editorial-archive] remote lookup failed, falling back to local:", err);
        }
    }
    const archive = await loadArchive();
    return archive.items[hash] ?? null;
}
/**
 * Persist an editorial to the deep archive.
 * If one already exists for this hash, bumps the version.
 */
async function saveEditorial(hash, editorial, generatedBy) {
    if ((0, indexer_backend_1.getIndexerBackendUrl)()) {
        try {
            await saveRemoteEditorial(hash, editorial, generatedBy);
            return;
        }
        catch (err) {
            console.warn("[editorial-archive] remote save failed, falling back to local:", err);
        }
    }
    const archive = await loadArchive();
    const now = new Date().toISOString();
    const existing = archive.items[hash];
    const contentHash = computeContentHash(editorial);
    const record = {
        ...editorial,
        entityHash: hash,
        generatedAt: now,
        generatedBy,
        contentHash,
        version: existing ? existing.version + 1 : 1,
        onchainTxHash: existing?.onchainTxHash,
        onchainTimestamp: existing?.onchainTimestamp,
    };
    archive.items[hash] = record;
    archive.updatedAt = now;
    cache = archive;
    cacheLoadedAtMs = Date.now();
    await persistArchive(archive);
    console.log(`[editorial-archive] saved ${hash.slice(0, 10)}... (${generatedBy}, v${record.version})`);
}
/**
 * Mark an editorial as backed up onchain.
 */
async function markOnchain(hash, txHash) {
    if ((0, indexer_backend_1.getIndexerBackendUrl)()) {
        try {
            await markRemoteEditorialOnchain(hash, txHash);
            return;
        }
        catch (err) {
            console.warn("[editorial-archive] remote mark-onchain failed, falling back to local:", err);
        }
    }
    const archive = await loadArchive();
    const record = archive.items[hash];
    if (!record)
        return;
    record.onchainTxHash = txHash;
    record.onchainTimestamp = new Date().toISOString();
    archive.updatedAt = new Date().toISOString();
    cache = archive;
    cacheLoadedAtMs = Date.now();
    await persistArchive(archive);
    console.log(`[editorial-archive] marked onchain ${hash.slice(0, 10)}... tx=${txHash.slice(0, 10)}...`);
}
/**
 * Return all hashes that already have editorials.
 * Used by the batch generation script to skip already-generated items.
 */
async function getAllEditorialHashes() {
    if ((0, indexer_backend_1.getIndexerBackendUrl)()) {
        try {
            return await fetchRemoteEditorialHashes();
        }
        catch (err) {
            console.warn("[editorial-archive] remote hash list failed, falling back to local:", err);
        }
    }
    const archive = await loadArchive();
    return new Set(Object.keys(archive.items));
}
/**
 * Return recent editorials that include structured market impact analysis.
 */
async function listRecentMarketImpactRecords(limit = 200) {
    if ((0, indexer_backend_1.getIndexerBackendUrl)()) {
        try {
            return await fetchRemoteMarketImpactRecords(limit);
        }
        catch (err) {
            console.warn("[editorial-archive] remote market-impact list failed, falling back to local:", err);
        }
    }
    const archive = await loadArchive();
    const records = Object.values(archive.items)
        .filter((item) => {
        const impact = item.marketImpact;
        if (!impact)
            return false;
        return Array.isArray(impact.affectedMarkets) && impact.affectedMarkets.length > 0;
    })
        .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
        .slice(0, Math.max(1, limit))
        .map((item) => ({
        entityHash: item.entityHash,
        generatedAt: item.generatedAt,
        claim: item.claim,
        marketImpact: item.marketImpact,
    }));
    return records;
}
