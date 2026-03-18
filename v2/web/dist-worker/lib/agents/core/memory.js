"use strict";
// ─── Agent Core — Persistent Memory ──────────────────────────────────────────
//
// Adapted from NounIRL's memory.ts for the Pooter agent swarm.
// Primary storage: indexer backend API (Ponder + Postgres).
// Fallback: local JSON file via Store<T> pattern.
//
// Scopes:
//   "knowledge"           — facts extracted from URLs + self-learning
//   "knowledge-sources"   — metadata about learned sources
//   "global"              — shared facts Pooter remembers globally
//   "wallet:<address>"    — per-user preferences / history
//   "self-learn-progress" — progress tracking for resumable pipelines
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.remember = remember;
exports.recall = recall;
exports.forget = forget;
exports.recallAll = recallAll;
exports.countByScope = countByScope;
exports.buildMemoryContext = buildMemoryContext;
require("server-only");
const store_1 = require("./store");
// ─── Indexer helpers ────────────────────────────────────────────────────────
function getIndexerUrl() {
    const url = (process.env.INDEXER_BACKEND_URL ??
        process.env.ARCHIVE_BACKEND_URL ??
        process.env.SCANNER_BACKEND_URL ??
        "").trim();
    return url ? url.replace(/\/$/, "") : null;
}
function getAuthHeaders() {
    const headers = { "content-type": "application/json" };
    const secret = process.env.INDEXER_WORKER_SECRET?.trim();
    if (secret) {
        headers.authorization = `Bearer ${secret}`;
    }
    return headers;
}
async function indexerFetch(path, init) {
    const base = getIndexerUrl();
    if (!base)
        throw new Error("Indexer backend URL not configured");
    const url = new URL(path, `${base}/`);
    const response = await fetch(url.toString(), {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(init?.timeoutMs ?? 8_000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }
    return (await response.json());
}
// ─── Fallback store ─────────────────────────────────────────────────────────
let fallbackStore = null;
function getFallbackStore() {
    if (!fallbackStore) {
        fallbackStore = new store_1.Store({
            persistPath: "/tmp/pooter-memory.json",
            maxItems: 2000,
            keyFn: (entry) => entry.key,
        });
    }
    return fallbackStore;
}
// ─── Core operations ────────────────────────────────────────────────────────
async function remember(scope, key, content) {
    const base = getIndexerUrl();
    if (!base) {
        // Fallback: local store
        const store = getFallbackStore();
        const compositeKey = `${scope}:${key}`;
        const now = Date.now();
        const existing = store.get(compositeKey);
        store.add({
            key: compositeKey,
            scope,
            content,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        return;
    }
    try {
        await indexerFetch("/api/v1/memory/remember", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ scope, key, content }),
        });
    }
    catch (err) {
        console.warn(`[memory] indexer remember failed, using fallback:`, err instanceof Error ? err.message : err);
        const store = getFallbackStore();
        const compositeKey = `${scope}:${key}`;
        const now = Date.now();
        const existing = store.get(compositeKey);
        store.add({
            key: compositeKey,
            scope,
            content,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
    }
}
async function recall(scope, key) {
    const base = getIndexerUrl();
    if (!base) {
        return recallFromFallback(scope, key);
    }
    try {
        const params = new URLSearchParams({ scope });
        if (key)
            params.set("key", key);
        const result = await indexerFetch(`/api/v1/memory/recall?${params.toString()}`);
        return result.memories ?? [];
    }
    catch (err) {
        console.warn(`[memory] indexer recall failed, using fallback:`, err instanceof Error ? err.message : err);
        return recallFromFallback(scope, key);
    }
}
function recallFromFallback(scope, key) {
    const store = getFallbackStore();
    if (key) {
        const entry = store.get(`${scope}:${key}`);
        return entry ? [entry] : [];
    }
    return store
        .getAll()
        .filter((e) => e.scope === scope)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
}
async function forget(scope, key) {
    const base = getIndexerUrl();
    if (!base) {
        getFallbackStore().remove(`${scope}:${key}`);
        return;
    }
    try {
        await indexerFetch("/api/v1/memory/forget", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ scope, key }),
        });
    }
    catch (err) {
        console.warn(`[memory] indexer forget failed, using fallback:`, err instanceof Error ? err.message : err);
        getFallbackStore().remove(`${scope}:${key}`);
    }
}
async function recallAll(limit = 100) {
    const base = getIndexerUrl();
    if (!base) {
        return getFallbackStore()
            .getAll()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);
    }
    try {
        const result = await indexerFetch(`/api/v1/memory/all?limit=${limit}`);
        return result.memories ?? [];
    }
    catch (err) {
        console.warn(`[memory] indexer recallAll failed, using fallback:`, err instanceof Error ? err.message : err);
        return getFallbackStore()
            .getAll()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);
    }
}
async function countByScope(scope) {
    const base = getIndexerUrl();
    if (!base) {
        return getFallbackStore().getAll().filter((e) => e.scope === scope).length;
    }
    try {
        const result = await indexerFetch(`/api/v1/memory/count?scope=${encodeURIComponent(scope)}`);
        return result.count ?? 0;
    }
    catch {
        return getFallbackStore().getAll().filter((e) => e.scope === scope).length;
    }
}
// ─── Context builder for system prompt injection ────────────────────────────
const MAX_KNOWLEDGE_FACTS = 40;
const MAX_GLOBAL_FACTS = 20;
const MAX_WALLET_FACTS = 15;
/**
 * Build a formatted memory context string for injection into the LLM system prompt.
 * Returns null if no memories exist.
 */
async function buildMemoryContext(wallet) {
    const sections = [];
    try {
        // 1. Knowledge facts (from URLs + self-learning)
        const knowledge = await recall("knowledge");
        if (knowledge.length > 0) {
            const facts = knowledge
                .slice(0, MAX_KNOWLEDGE_FACTS)
                .map((m) => `• ${m.content}`)
                .join("\n");
            sections.push(`LEARNED KNOWLEDGE (from ingested sources):\n${facts}`);
        }
        // 2. Global remembered facts
        const global = await recall("global");
        if (global.length > 0) {
            const facts = global
                .slice(0, MAX_GLOBAL_FACTS)
                .map((m) => {
                // Strip scope prefix from key for display
                const displayKey = m.key.replace(/^global:/, "");
                return `- ${displayKey}: ${m.content}`;
            })
                .join("\n");
            sections.push(`REMEMBERED FACTS:\n${facts}`);
        }
        // 3. Per-wallet memories
        if (wallet) {
            const walletScope = `wallet:${wallet.toLowerCase()}`;
            const walletMemories = await recall(walletScope);
            if (walletMemories.length > 0) {
                const shortAddr = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
                const facts = walletMemories
                    .slice(0, MAX_WALLET_FACTS)
                    .map((m) => {
                    const displayKey = m.key.replace(new RegExp(`^${walletScope}:`), "");
                    return `- ${displayKey}: ${m.content}`;
                })
                    .join("\n");
                sections.push(`REMEMBERED ABOUT THIS USER (${shortAddr}):\n${facts}`);
            }
        }
    }
    catch (err) {
        console.warn(`[memory] buildMemoryContext error:`, err instanceof Error ? err.message : err);
        return null;
    }
    if (sections.length === 0)
        return null;
    return `\n\n${sections.join("\n\n")}`;
}
