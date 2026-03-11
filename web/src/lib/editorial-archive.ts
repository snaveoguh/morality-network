import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { keccak256, toBytes } from "viem";
import type { ArticleContent } from "./article";

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
  const archive = await loadArchive();
  const now = new Date().toISOString();
  const existing = archive.items[hash];

  const contentHash = computeContentHash(editorial);

  const record: ArchivedEditorial = {
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
  const archive = await loadArchive();
  return new Set(Object.keys(archive.items));
}

/**
 * Return recent editorials that include structured market impact analysis.
 */
export async function listRecentMarketImpactRecords(
  limit = 200,
): Promise<ArchivedMarketImpactRecord[]> {
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
