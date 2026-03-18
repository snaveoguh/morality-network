import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { keccak256, toBytes } from "viem";
import type { ArticleContent } from "./article";
import { fetchIndexerJson, getIndexerBackendUrl } from "./server/indexer-backend";

// ============================================================================
// EDITORIAL ARCHIVE — Deep persistence for AI-generated editorials
// Same pattern as archive.ts: JSON file, in-memory cache, write locking
// ============================================================================

export interface ArchivedEditorial extends ArticleContent {
  entityHash: string;
  generatedAt: string;
  generatedBy: "claude-ai" | "template-fallback";
  contentHash: string; // keccak256 of serialized editorial for onchain verification
  version: number;
  onchainTxHash?: string;
  onchainTimestamp?: string;
  /** Persisted daily title for NFT metadata (e.g. "THE GREAT UNWINDING") */
  dailyTitle?: string;
}

export interface ArchivedMarketImpactRecord {
  entityHash: string;
  generatedAt: string;
  claim: string;
  marketImpact: NonNullable<ArticleContent["marketImpact"]>;
}

interface EditorialArchiveFile {
  version: 1;
  updatedAt: string;
  items: Record<string, ArchivedEditorial>;
}

const ARCHIVE_FILE_PATH = path.join(
  process.cwd(),
  "src/data/editorial-archive.json",
);

const EMPTY_ARCHIVE: EditorialArchiveFile = {
  version: 1,
  updatedAt: "",
  items: {},
};

let cache: EditorialArchiveFile | null = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 30_000;

async function fetchRemoteArchivedEditorial(
  hash: string,
): Promise<ArchivedEditorial | null> {
  const payload = await fetchIndexerJson<{ editorial?: ArchivedEditorial }>(
    `/api/v1/archive/editorials/${hash}`,
    { timeoutMs: 20_000 },
  );
  return payload.editorial ?? null;
}

async function saveRemoteEditorial(
  hash: string,
  editorial: ArticleContent,
  generatedBy: "claude-ai" | "template-fallback",
): Promise<void> {
  // Strip illustration data — too large for remote JSON payload (2MB+)
  const { illustrationBase64: _i, illustrationPrompt: _p, ...leanEditorial } = editorial;
  await fetchIndexerJson(
    "/api/v1/archive/editorials/upsert",
    {
      method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hash,
        editorial: { ...leanEditorial, hasIllustration: editorial.hasIllustration || !!_i },
        generatedBy,
      }),
      timeoutMs: 30_000,
    },
  );
}

async function markRemoteEditorialOnchain(
  hash: string,
  txHash: string,
): Promise<void> {
  await fetchIndexerJson(
    `/api/v1/archive/editorials/${hash}/mark-onchain`,
    {
      method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
      timeoutMs: 20_000,
    },
  );
}

async function fetchRemoteEditorialHashes(limit = 100_000): Promise<Set<string>> {
  const payload = await fetchIndexerJson<{ hashes?: string[] }>(
    `/api/v1/archive/editorials/hashes?limit=${Math.max(1, limit)}`,
    { timeoutMs: 20_000 },
  );
  return new Set(Array.isArray(payload.hashes) ? payload.hashes : []);
}

async function fetchRemoteMarketImpactRecords(
  limit = 200,
): Promise<ArchivedMarketImpactRecord[]> {
  const payload = await fetchIndexerJson<{ records?: ArchivedMarketImpactRecord[] }>(
    `/api/v1/archive/editorials/market-impact?limit=${Math.max(1, limit)}`,
    { timeoutMs: 20_000 },
  );
  return Array.isArray(payload.records) ? payload.records : [];
}

async function loadArchive(): Promise<EditorialArchiveFile> {
  const now = Date.now();
  if (cache && now - cacheLoadedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const raw = await readFile(ARCHIVE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<EditorialArchiveFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.items) {
      cache = { ...EMPTY_ARCHIVE };
    } else {
      cache = {
        version: 1,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        items: parsed.items as Record<string, ArchivedEditorial>,
      };
    }
  } catch {
    cache = { ...EMPTY_ARCHIVE };
  }

  cacheLoadedAtMs = now;
  return cache;
}

let saveInFlight = false;

async function persistArchive(archive: EditorialArchiveFile): Promise<void> {
  if (saveInFlight) return;
  try {
    saveInFlight = true;
    const dir = path.dirname(ARCHIVE_FILE_PATH);
    await mkdir(dir, { recursive: true });
    await writeFile(
      ARCHIVE_FILE_PATH,
      JSON.stringify(archive, null, 2),
      "utf8",
    );
  } finally {
    saveInFlight = false;
  }
}

/**
 * Compute a deterministic content hash for an editorial.
 * Used for onchain verification — keccak256 of the editorial body + metadata.
 */
function computeContentHash(editorial: ArticleContent): string {
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
  return keccak256(toBytes(payload));
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Look up a cached editorial by entity hash.
 */
export async function getArchivedEditorial(
  hash: string,
): Promise<ArchivedEditorial | null> {
  if (getIndexerBackendUrl()) {
    try {
      const remote = await fetchRemoteArchivedEditorial(hash);
      if (remote) {
        // Back-fill local archive so it stays in sync as a fallback
        const archive = await loadArchive();
        if (!archive.items[hash]) {
          archive.items[hash] = remote;
          archive.updatedAt = new Date().toISOString();
          cache = archive;
          cacheLoadedAtMs = Date.now();
          persistArchive(archive).catch(() => {});
        }
        return remote;
      }
    } catch (err) {
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
export async function saveEditorial(
  hash: string,
  editorial: ArticleContent,
  generatedBy: "claude-ai" | "template-fallback",
): Promise<void> {
  if (getIndexerBackendUrl()) {
    try {
      await saveRemoteEditorial(hash, editorial, generatedBy);
    } catch (err) {
      console.warn("[editorial-archive] remote save failed:", err);
    }
  }

  // Always save locally — remote indexer reads are unreliable (404 after successful write),
  // so the local file must stay up-to-date as a fallback.

  const archive = await loadArchive();
  const now = new Date().toISOString();
  const existing = archive.items[hash];

  const contentHash = computeContentHash(editorial);

  // Strip illustration data — stored separately in illustration-store.ts
  // Keeping it inline bloats the archive from ~4MB to 6.5MB+ and causes timeouts.
  const { illustrationBase64: _illus, illustrationPrompt: _prompt, ...editorialWithoutIllustration } = editorial;

  const record: ArchivedEditorial = {
    ...editorialWithoutIllustration,
    hasIllustration: editorial.hasIllustration || !!_illus,
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

  try {
    await persistArchive(archive);
  } catch (err) {
    // Vercel serverless has a read-only filesystem — log and continue
    console.warn("[editorial-archive] local persist failed (read-only fs?):", err instanceof Error ? err.message : err);
    return;
  }
  console.log(
    `[editorial-archive] saved ${hash.slice(0, 10)}... (${generatedBy}, v${record.version})`,
  );
}

/**
 * Mark an editorial as backed up onchain.
 */
export async function markOnchain(
  hash: string,
  txHash: string,
): Promise<void> {
  if (getIndexerBackendUrl()) {
    try {
      await markRemoteEditorialOnchain(hash, txHash);
      return;
    } catch (err) {
      console.warn("[editorial-archive] remote mark-onchain failed, falling back to local:", err);
    }
  }

  const archive = await loadArchive();
  const record = archive.items[hash];
  if (!record) return;

  record.onchainTxHash = txHash;
  record.onchainTimestamp = new Date().toISOString();
  archive.updatedAt = new Date().toISOString();
  cache = archive;
  cacheLoadedAtMs = Date.now();

  await persistArchive(archive);
  console.log(
    `[editorial-archive] marked onchain ${hash.slice(0, 10)}... tx=${txHash.slice(0, 10)}...`,
  );
}

/**
 * Return all hashes that already have editorials.
 * Used by the batch generation script to skip already-generated items.
 */
export async function getAllEditorialHashes(): Promise<Set<string>> {
  if (getIndexerBackendUrl()) {
    try {
      return await fetchRemoteEditorialHashes();
    } catch (err) {
      console.warn("[editorial-archive] remote hash list failed, falling back to local:", err);
    }
  }

  const archive = await loadArchive();
  return new Set(Object.keys(archive.items));
}

/**
 * Return recent editorials that include structured market impact analysis.
 */
export async function listRecentMarketImpactRecords(
  limit = 200,
): Promise<ArchivedMarketImpactRecord[]> {
  if (getIndexerBackendUrl()) {
    try {
      return await fetchRemoteMarketImpactRecords(limit);
    } catch (err) {
      console.warn("[editorial-archive] remote market-impact list failed, falling back to local:", err);
    }
  }

  const archive = await loadArchive();
  const records = Object.values(archive.items)
    .filter(
      (
        item,
      ): item is ArchivedEditorial & {
        marketImpact: NonNullable<ArticleContent["marketImpact"]>;
      } => {
        const impact = item.marketImpact;
        if (!impact) return false;
        return Array.isArray(impact.affectedMarkets) && impact.affectedMarkets.length > 0;
      },
    )
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    )
    .slice(0, Math.max(1, limit))
    .map((item) => ({
      entityHash: item.entityHash,
      generatedAt: item.generatedAt,
      claim: item.claim,
      marketImpact: item.marketImpact,
    }));

  return records;
}

/**
 * Return the editorial content hash for onchain verification.
 */
export { computeContentHash };
