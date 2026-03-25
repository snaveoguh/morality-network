import "server-only";

import type { StumbleContextEntry } from "./stumble-context";

// ============================================================================
// ENTITY CONTEXT REGISTRY
// Persistent metadata for every entity hash — Redis-backed, write-merge.
// Pattern follows archive.ts (Upstash REST, in-memory cache, fire-and-forget).
// ============================================================================

export interface EntityContext {
  hash: `0x${string}`;
  title: string;
  description?: string;
  imageUrl?: string;
  /** Display source: "Reuters", "Nouns DAO", "Farcaster", etc. */
  source: string;
  /** Content type: "article" | "proposal" | "domain" | "address" | "cast" | etc. */
  type: string;
  /** Original external URL */
  url?: string;
  /** Internal pooter.world link: "/proposals/nouns-951", "/article/0x..." */
  linkBack?: string;
  /** DAO name (proposals only) */
  dao?: string;
  /** Proposal status (proposals only) */
  status?: string;
  /** Accumulated related entity hashes (capped at 50) */
  relatedHashes?: string[];
  updatedAt: string;
  createdAt: string;
}

/* ── Upstash Redis REST ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_PREFIX = "pooter:entity-ctx:";
const REDIS_TTL = 2_592_000; // 30 days

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

/* ── In-memory cache (single serverless invocation) ── */

const memCache = new Map<string, EntityContext>();

/* ── Merge logic ── */

function mergeContext(
  existing: EntityContext | null,
  incoming: Partial<EntityContext> & { hash: `0x${string}` },
): EntityContext {
  const now = new Date().toISOString();

  if (!existing) {
    return {
      title: "Unknown",
      source: "unknown",
      type: "unknown",
      createdAt: now,
      updatedAt: now,
      ...incoming,
    };
  }

  return {
    ...existing,
    title: incoming.title || existing.title,
    description: incoming.description || existing.description,
    imageUrl: incoming.imageUrl || existing.imageUrl,
    source: incoming.source || existing.source,
    type: incoming.type || existing.type,
    url: incoming.url || existing.url,
    linkBack: incoming.linkBack || existing.linkBack,
    dao: incoming.dao || existing.dao,
    status: incoming.status ?? existing.status,
    relatedHashes: [
      ...new Set([
        ...(existing.relatedHashes ?? []),
        ...(incoming.relatedHashes ?? []),
      ]),
    ].slice(0, 50),
    updatedAt: now,
    createdAt: existing.createdAt,
  };
}

/* ── Read: memory → Redis → null ── */

export async function getEntityContext(
  hash: `0x${string}`,
): Promise<EntityContext | null> {
  const key = hash.toLowerCase();

  const mem = memCache.get(key);
  if (mem) return mem;

  if (!redisEnabled()) return null;

  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_PREFIX}${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result) as EntityContext;
    memCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/* ── Write: read-merge-write ── */

export async function setEntityContext(
  incoming: Partial<EntityContext> & { hash: `0x${string}` },
): Promise<void> {
  const key = incoming.hash.toLowerCase();
  const existing = await getEntityContext(incoming.hash);
  const merged = mergeContext(existing, incoming);

  memCache.set(key, merged);

  if (!redisEnabled()) return;

  try {
    const serialized = JSON.stringify(merged);
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", `${REDIS_PREFIX}${key}`, serialized, "EX", String(REDIS_TTL)],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Non-fatal — memory cache still holds the value for this invocation
  }
}

/* ── Batch write (fire-and-forget, for article archiving) ── */

export async function setEntityContextBatch(
  contexts: Array<Partial<EntityContext> & { hash: `0x${string}` }>,
): Promise<void> {
  if (contexts.length === 0) return;

  // Merge each into memory
  const commands: string[][] = [];
  for (const incoming of contexts) {
    const key = incoming.hash.toLowerCase();
    const existing = memCache.get(key) ?? null;
    const merged = mergeContext(existing, incoming);
    memCache.set(key, merged);

    if (redisEnabled()) {
      commands.push([
        "SET",
        `${REDIS_PREFIX}${key}`,
        JSON.stringify(merged),
        "EX",
        String(REDIS_TTL),
      ]);
    }
  }

  if (commands.length === 0 || !redisEnabled()) return;

  // Batch in chunks of 50 to stay within Upstash pipeline limits
  const CHUNK_SIZE = 50;
  for (let i = 0; i < commands.length; i += CHUNK_SIZE) {
    const chunk = commands.slice(i, i + CHUNK_SIZE);
    try {
      await fetch(`${UPSTASH_URL}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Non-fatal
    }
  }
}

/* ── Type bridge ── */

export function entityContextToStumbleEntry(
  ctx: EntityContext,
): StumbleContextEntry {
  return {
    hash: ctx.hash,
    url: ctx.url,
    title: ctx.title,
    source: ctx.source,
    type: ctx.type,
    description: ctx.description,
    savedAt: ctx.updatedAt,
  };
}
