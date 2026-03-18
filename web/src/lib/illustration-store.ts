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
  const store = await loadStore();
  return store.items[hash] ?? null;
}

/**
 * Save an illustration for an entity hash.
 */
export async function saveIllustration(
  hash: string,
  data: { base64: string; prompt: string; revisedPrompt?: string | null },
): Promise<void> {
  const store = await loadStore();
  const now = new Date().toISOString();

  store.items[hash] = {
    base64: data.base64,
    prompt: data.prompt,
    revisedPrompt: data.revisedPrompt,
  };
  store.updatedAt = now;
  cache = store;
  cacheLoadedAtMs = Date.now();

  try {
    await persistStore(store);
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
}
