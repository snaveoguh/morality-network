import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { keccak256, toBytes } from "viem";
import type { ArticleContent } from "./article";
import { fetchIndexerJson, getIndexerBackendUrl } from "./server/indexer-backend";
import { reportWarn } from "./report-error";

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

/* ── Upstash Redis REST helpers (mirrors position-store.ts pattern) ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_EDITORIAL_PREFIX = "pooter:editorial:";

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGetEditorial(hash: string): Promise<ArchivedEditorial | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_EDITORIAL_PREFIX}${hash}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result);
    // Handle double-wrapped format: SET stores {"EX":ttl,"value":"<json>"}
    // as the raw value instead of extracting the value field
    if (parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.value === "string") {
      return JSON.parse(parsed.value) as ArchivedEditorial;
    }
    return parsed as ArchivedEditorial;
  } catch {
    return null;
  }
}

async function redisSetEditorial(hash: string, editorial: ArchivedEditorial): Promise<void> {
  if (!redisEnabled()) return;
  try {
    // TTL = 48 hours (editorial is daily, keep 2 days as buffer)
    // Use Upstash pipeline format to SET with EX correctly
    const serialized = JSON.stringify(editorial);
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", `${REDIS_EDITORIAL_PREFIX}${hash}`, serialized, "EX", "172800"]]),
      cache: "no-store",
    });
  } catch (e) {
    reportWarn("editorial-archive:redis-set", e);
  }
}

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
  // Validate that a returned editorial actually belongs to the requested hash.
  // The indexer/Redis can return stale or corrupted data where entityHash
  // inside the payload doesn't match the row ID (e.g. a daily edition
  // overwriting a regular article's slot). Skip mismatches silently.
  function validateEditorial(
    editorial: ArchivedEditorial | null,
    source: string,
  ): ArchivedEditorial | null {
    if (!editorial) return null;
    if (editorial.entityHash && editorial.entityHash !== hash) {
      console.warn(
        `[editorial-archive] ${source} hash mismatch: requested ${hash.slice(0, 14)} but got ${editorial.entityHash.slice(0, 14)} — skipping`,
      );
      return null;
    }
    return editorial;
  }

  // 1. Redis (fastest, survives serverless cold starts)
  const fromRedis = validateEditorial(await redisGetEditorial(hash), "Redis");
  if (fromRedis) {
    console.log(`[editorial-archive] Redis hit: ${hash.slice(0, 10)}`);
    return fromRedis;
  }

  // 2. Remote indexer
  if (getIndexerBackendUrl()) {
    try {
      const remote = validateEditorial(
        await fetchRemoteArchivedEditorial(hash),
        "indexer",
      );
      if (remote) {
        redisSetEditorial(hash, remote).catch(() => {});
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

  // 3. Local file (fallback)
  const archive = await loadArchive();
  const local = validateEditorial(archive.items[hash] ?? null, "local");
  if (local) {
    redisSetEditorial(hash, local).catch(() => {});
  }
  return local;
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

  // Redis first — survives serverless cold starts
  redisSetEditorial(hash, record).catch(() => {});

  try {
    await persistArchive(archive);
  } catch (err) {
    // Vercel serverless has a read-only filesystem — log and continue
    console.warn("[editorial-archive] local persist failed (read-only fs?):", err instanceof Error ? err.message : err);
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
 * Return recent Pooter Originals for the feed.
 *
 * Tries the remote indexer first (fresh data that survives deploys), then
 * falls back to the local JSON archive. Each editorial is resolved via
 * getArchivedEditorial() which checks Redis → indexer → local file.
 */
export interface PooterOriginal {
  hash: string;
  title: string;
  subheadline: string;
  category: string;
  source: string;
  generatedAt: string;
  hasIllustration: boolean;
  isDailyEdition: boolean;
  dailyTitle?: string;
  tags: string[];
  editedBy?: string;
}

function archivedToOriginal(item: ArchivedEditorial): PooterOriginal {
  return {
    hash: item.entityHash,
    title: item.primary.title,
    subheadline: item.subheadline,
    category: item.primary.category,
    source: item.primary.source,
    generatedAt: item.generatedAt,
    hasIllustration: !!item.hasIllustration,
    isDailyEdition: !!item.isDailyEdition,
    dailyTitle: item.dailyTitle,
    tags: item.tags ?? [],
    editedBy: item.editedBy,
  };
}

function filterOriginal(item: ArchivedEditorial, cutoff: number): boolean {
  if (item.generatedBy !== "claude-ai") return false;
  if (!item.editorialBody || item.editorialBody.length === 0) return false;
  if (cutoff > 0 && new Date(item.generatedAt).getTime() < cutoff) return false;
  return true;
}

export async function getRecentPooterOriginals(
  maxAge48h = true,
  limit = 20,
): Promise<PooterOriginal[]> {
  const cutoff = maxAge48h ? Date.now() - 48 * 60 * 60 * 1000 : 0;
  const safeLimit = Math.max(1, limit);

  // Try remote indexer first — has fresh data from crons
  if (getIndexerBackendUrl()) {
    try {
      const hashes = await fetchRemoteEditorialHashes(Math.max(safeLimit * 2, 30));
      if (hashes.size > 0) {
        const resolved = await Promise.all(
          Array.from(hashes).slice(0, Math.max(safeLimit * 2, 30)).map((h) =>
            getArchivedEditorial(h).catch(() => null),
          ),
        );
        const originals = resolved
          .filter((item): item is ArchivedEditorial => item !== null && filterOriginal(item, cutoff))
          .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
          .slice(0, safeLimit)
          .map(archivedToOriginal);
        if (originals.length > 0) return originals;
      }
    } catch (err) {
      console.warn("[editorial-archive] remote originals fetch failed, falling back to local:", err);
    }
  }

  // Fallback: local JSON archive
  const archive = await loadArchive();
  return Object.values(archive.items)
    .filter((item) => filterOriginal(item, cutoff))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, safeLimit)
    .map(archivedToOriginal);
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
