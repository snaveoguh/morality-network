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

import "server-only";

import { Store } from "./store";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  key: string;
  scope: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Indexer helpers ────────────────────────────────────────────────────────

function getIndexerUrl(): string | null {
  const url = (
    process.env.INDEXER_BACKEND_URL ??
    process.env.ARCHIVE_BACKEND_URL ??
    process.env.SCANNER_BACKEND_URL ??
    ""
  ).trim();
  return url ? url.replace(/\/$/, "") : null;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }
  return headers;
}

async function indexerFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const base = getIndexerUrl();
  if (!base) throw new Error("Indexer backend URL not configured");

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

  return (await response.json()) as T;
}

// ─── Fallback store ─────────────────────────────────────────────────────────

let fallbackStore: Store<MemoryEntry> | null = null;

function getFallbackStore(): Store<MemoryEntry> {
  if (!fallbackStore) {
    fallbackStore = new Store<MemoryEntry>({
      persistPath: "/tmp/pooter-memory.json",
      maxItems: 2000,
      keyFn: (entry) => entry.key,
    });
  }
  return fallbackStore;
}

// ─── Core operations ────────────────────────────────────────────────────────

export async function remember(scope: string, key: string, content: string): Promise<void> {
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
      method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
      headers: getAuthHeaders(),
      body: JSON.stringify({ scope, key, content }),
    });
  } catch (err) {
    console.warn(
      `[memory] indexer remember failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
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

export async function recall(scope: string, key?: string): Promise<MemoryEntry[]> {
  const base = getIndexerUrl();
  if (!base) {
    return recallFromFallback(scope, key);
  }

  try {
    const params = new URLSearchParams({ scope });
    if (key) params.set("key", key);

    const result = await indexerFetch<{ memories: MemoryEntry[] }>(
      `/api/v1/memory/recall?${params.toString()}`,
    );
    return result.memories ?? [];
  } catch (err) {
    console.warn(
      `[memory] indexer recall failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
    return recallFromFallback(scope, key);
  }
}

function recallFromFallback(scope: string, key?: string): MemoryEntry[] {
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

export async function forget(scope: string, key: string): Promise<void> {
  const base = getIndexerUrl();
  if (!base) {
    getFallbackStore().remove(`${scope}:${key}`);
    return;
  }

  try {
    await indexerFetch("/api/v1/memory/forget", {
      method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
      headers: getAuthHeaders(),
      body: JSON.stringify({ scope, key }),
    });
  } catch (err) {
    console.warn(
      `[memory] indexer forget failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
    getFallbackStore().remove(`${scope}:${key}`);
  }
}

export async function recallAll(limit = 100): Promise<MemoryEntry[]> {
  const base = getIndexerUrl();
  if (!base) {
    return getFallbackStore()
      .getAll()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  try {
    const result = await indexerFetch<{ memories: MemoryEntry[] }>(
      `/api/v1/memory/all?limit=${limit}`,
    );
    return result.memories ?? [];
  } catch (err) {
    console.warn(
      `[memory] indexer recallAll failed, using fallback:`,
      err instanceof Error ? err.message : err,
    );
    return getFallbackStore()
      .getAll()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
}

export async function countByScope(scope: string): Promise<number> {
  const base = getIndexerUrl();
  if (!base) {
    return getFallbackStore().getAll().filter((e) => e.scope === scope).length;
  }

  try {
    const result = await indexerFetch<{ count: number }>(
      `/api/v1/memory/count?scope=${encodeURIComponent(scope)}`,
    );
    return result.count ?? 0;
  } catch {
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
export async function buildMemoryContext(wallet?: string): Promise<string | null> {
  const sections: string[] = [];

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
  } catch (err) {
    console.warn(
      `[memory] buildMemoryContext error:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  if (sections.length === 0) return null;
  return `\n\n${sections.join("\n\n")}`;
}
