import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// ============================================================================
// ILLUSTRATION STORE — Separate persistence for DALL-E cover art
//
// Illustrations are 1-2MB base64 PNGs. Storing them inline in the editorial
// archive makes the archive file 6MB+ and causes timeouts on Vercel.
// This module stores illustrations in a separate file so editorials stay lean.
// ============================================================================

interface IllustrationRecord {
  base64: string;
  prompt: string;
  revisedPrompt?: string | null;
}

interface IllustrationStoreFile {
  version: 1;
  updatedAt: string;
  items: Record<string, IllustrationRecord>;
}

const STORE_FILE_PATH = path.join(
  process.cwd(),
  "src/data/illustrations.json",
);

const EMPTY_STORE: IllustrationStoreFile = {
  version: 1,
  updatedAt: "",
  items: {},
};

let cache: IllustrationStoreFile | null = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute — illustrations don't change often

/* ── Upstash Redis for illustration persistence (survives cold starts) ── */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_ILLUS_PREFIX = "pooter:illustration:";
const REDIS_ILLUS_TTL = 2592000; // 30 days

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGetIllustration(hash: string): Promise<IllustrationRecord | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_ILLUS_PREFIX}${hash}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    return JSON.parse(body.result) as IllustrationRecord;
  } catch {
    return null;
  }
}

async function redisSetIllustration(hash: string, data: IllustrationRecord): Promise<boolean> {
  if (!redisEnabled()) return false;
  try {
    // Use Upstash pipeline format (same as editorial-archive.ts) —
    // the /set/key endpoint doesn't accept large values in the body.
    const serialized = JSON.stringify(data);
    console.log(`[illustration-store] Redis SET ${hash.slice(0, 14)}... (${Math.round(serialized.length / 1024)}KB)`);
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", `${REDIS_ILLUS_PREFIX}${hash}`, serialized, "EX", String(REDIS_ILLUS_TTL)]]),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[illustration-store] Redis SET failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
      return false;
    }
    const body = await res.json().catch(() => null);
    console.log(`[illustration-store] Redis SET response:`, JSON.stringify(body)?.slice(0, 200));
    return true;
  } catch (err) {
    console.warn("[illustration-store] Redis SET error:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function loadStore(): Promise<IllustrationStoreFile> {
  const now = Date.now();
  if (cache && now - cacheLoadedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const raw = await readFile(STORE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<IllustrationStoreFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.items) {
      cache = { ...EMPTY_STORE };
    } else {
      cache = {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        items: parsed.items as Record<string, IllustrationRecord>,
      };
    }
  } catch {
    cache = { ...EMPTY_STORE };
  }

  cacheLoadedAtMs = now;
  return cache;
}

let saveInFlight = false;

async function persistStore(store: IllustrationStoreFile): Promise<void> {
  if (saveInFlight) return;
  try {
    saveInFlight = true;
    const dir = path.dirname(STORE_FILE_PATH);
    await mkdir(dir, { recursive: true });
    await writeFile(STORE_FILE_PATH, JSON.stringify(store, null, 2), "utf8");
  } finally {
    saveInFlight = false;
  }
}

/**
 * Get an illustration by entity hash.
 */
export async function getIllustration(
  hash: string,
): Promise<IllustrationRecord | null> {
  // Redis first (survives cold starts)
  const fromRedis = await redisGetIllustration(hash);
  if (fromRedis) return fromRedis;

  const store = await loadStore();
  const local = store.items[hash] ?? null;
  if (local) {
    redisSetIllustration(hash, local).catch(() => {});
  }
  return local;
}

/**
 * Save an illustration for an entity hash.
 * Returns true if saved to at least one persistent store (Redis or file).
 */
export async function saveIllustration(
  hash: string,
  data: { base64: string; prompt: string; revisedPrompt?: string | null },
): Promise<boolean> {
  const store = await loadStore();
  const now = new Date().toISOString();

  const record: IllustrationRecord = {
    base64: data.base64,
    prompt: data.prompt,
    revisedPrompt: data.revisedPrompt,
  };
  store.items[hash] = record;
  store.updatedAt = now;
  cache = store;
  cacheLoadedAtMs = Date.now();

  let persisted = false;

  // Redis first (survives Vercel cold starts)
  const redisSaved = await redisSetIllustration(hash, record);
  if (redisSaved) persisted = true;

  try {
    await persistStore(store);
    persisted = true;
    console.log(
      `[illustration-store] saved ${hash.slice(0, 10)}... (${Math.round(data.base64.length / 1024)}KB)`,
    );
  } catch (err) {
    // Vercel serverless has a read-only filesystem
    console.warn(
      "[illustration-store] persist failed (read-only fs?):",
      err instanceof Error ? err.message : err,
    );
  }

  if (!persisted) {
    console.warn("[illustration-store] WARNING: illustration not persisted to any store");
  }

  return persisted;
}
