import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { DEFAULT_FEEDS, fetchAllFeeds, type FeedItem } from "./rss";
import { computeEntityHash } from "./entity";
import { extractCanonicalClaim } from "./claim-extract";
import { normalizeUrl, verifyEvidence } from "./evidence-verify";
import { fetchIndexerJson, getIndexerBackendUrl } from "./server/indexer-backend";
import { reportWarn } from "./report-error";

export interface ArchivedFeedItem {
  hash: `0x${string}`;
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  category: string;
  imageUrl?: string;
  bias?: FeedItem["bias"];
  tags?: string[];
  canonicalClaim?: string;
  preservedLinks?: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  archivedAt: string;
}

interface ArticleArchiveFile {
  version: 1;
  updatedAt: string;
  items: Record<string, ArchivedFeedItem>;
}

interface ArchiveFromUrlOptions {
  source?: string;
  sourceUrl?: string;
  category?: string;
  description?: string;
  tags?: string[];
  imageUrl?: string;
  pubDate?: string;
}

const ARCHIVE_FILE_PATH = path.join(process.cwd(), "src/data/article-archive.json");
const EMPTY_ARCHIVE: ArticleArchiveFile = {
  version: 1,
  updatedAt: "",
  items: {},
};

let cache: ArticleArchiveFile | null = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 30_000;
const REMOTE_ARCHIVE_LIMIT = 100_000;

/* ── Upstash Redis REST helpers (survives Vercel cold starts) ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_ARTICLE_PREFIX = "pooter:article:";
const REDIS_ARTICLE_TTL = 604800; // 7 days

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGetArticle(hash: string): Promise<ArchivedFeedItem | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_ARTICLE_PREFIX}${hash}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result);
    // Handle double-wrapped format from legacy SET calls
    if (parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.value === "string") {
      return JSON.parse(parsed.value) as ArchivedFeedItem;
    }
    return parsed as ArchivedFeedItem;
  } catch {
    return null;
  }
}

async function redisSetArticle(hash: string, item: ArchivedFeedItem): Promise<void> {
  if (!redisEnabled()) return;
  try {
    // Use pipeline format to SET with EX correctly
    const serialized = JSON.stringify(item);
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", `${REDIS_ARTICLE_PREFIX}${hash}`, serialized, "EX", String(REDIS_ARTICLE_TTL)]]),
      cache: "no-store",
    });
  } catch (e) {
    reportWarn("archive:redis-set", e);
  }
}

/** Batch-set multiple articles to Redis via pipeline */
async function redisSetArticleBatch(items: ArchivedFeedItem[]): Promise<void> {
  if (!redisEnabled() || items.length === 0) return;
  try {
    // Upstash REST pipeline: POST array of commands
    const commands = items.map((item) => [
      "SET",
      `${REDIS_ARTICLE_PREFIX}${item.hash}`,
      JSON.stringify(item),
      "EX",
      String(REDIS_ARTICLE_TTL),
    ]);
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
  } catch (e) {
    reportWarn("archive:redis-set", e);
  }
}

async function fetchRemoteArchivedItem(
  hash: `0x${string}`,
): Promise<ArchivedFeedItem | null> {
  const payload = await fetchIndexerJson<{ item?: ArchivedFeedItem }>(
    `/api/v1/archive/articles/${hash}`,
  );
  return payload.item ?? null;
}

async function fetchRemoteArchivedItems(): Promise<ArchivedFeedItem[]> {
  const payload = await fetchIndexerJson<{ items?: ArchivedFeedItem[] }>(
    `/api/v1/archive/articles?limit=${REMOTE_ARCHIVE_LIMIT}`,
    { timeoutMs: 20_000 },
  );
  return Array.isArray(payload.items) ? payload.items : [];
}

async function upsertRemoteArchivedItems(items: FeedItem[]): Promise<void> {
  await fetchIndexerJson(
    "/api/v1/archive/articles/upsert",
    {
      method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
      timeoutMs: 20_000,
    },
  );
}

async function loadArchive(): Promise<ArticleArchiveFile> {
  const now = Date.now();
  if (cache && now - cacheLoadedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const raw = await readFile(ARCHIVE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ArticleArchiveFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.items) {
      cache = EMPTY_ARCHIVE;
    } else {
      cache = {
        version: 1,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
        items: parsed.items as Record<string, ArchivedFeedItem>,
      };
    }
  } catch {
    cache = EMPTY_ARCHIVE;
  }

  cacheLoadedAtMs = now;
  return cache;
}

function toFeedItem(record: ArchivedFeedItem): FeedItem {
  const canonicalClaim =
    record.canonicalClaim ||
    extractCanonicalClaim({
      title: record.title,
      description: record.description,
      url: record.link,
    });

  return {
    id: record.id || record.hash,
    title: record.title,
    link: record.link,
    description: record.description,
    pubDate: record.pubDate,
    source: record.source,
    sourceUrl: record.sourceUrl,
    category: record.category,
    imageUrl: record.imageUrl,
    bias: record.bias ?? null,
    tags: record.tags ?? [],
    canonicalClaim,
  };
}

function toArchivedRecord(item: FeedItem): ArchivedFeedItem | null {
  if (!item.link) return null;

  const hash = computeEntityHash(item.link) as `0x${string}`;
  const now = new Date().toISOString();
  const canonicalClaim =
    item.canonicalClaim ||
    extractCanonicalClaim({
      title: item.title,
      description: item.description,
      url: item.link,
    });

  return {
    hash,
    id: item.id || hash,
    title: item.title,
    link: item.link,
    description: item.description || "",
    pubDate: item.pubDate,
    source: item.source,
    sourceUrl: item.sourceUrl || "",
    category: item.category,
    imageUrl: item.imageUrl ?? undefined,
    bias: item.bias ?? undefined,
    tags: item.tags ?? [],
    canonicalClaim,
    firstSeenAt: now,
    lastSeenAt: now,
    seenCount: 1,
    archivedAt: now,
  };
}

async function mergeCurrentFeedIntoArchive(
  records: ArchivedFeedItem[],
): Promise<ArchivedFeedItem[]> {
  try {
    const liveItems = await fetchAllFeeds(DEFAULT_FEEDS);
    if (liveItems.length === 0) return records;

    const merged = new Map<string, ArchivedFeedItem>(
      records.map((record) => [record.hash, record]),
    );

    for (const item of liveItems) {
      const liveRecord = toArchivedRecord(item);
      if (!liveRecord) continue;

      const existing = merged.get(liveRecord.hash);
      if (!existing) {
        merged.set(liveRecord.hash, liveRecord);
        continue;
      }

      merged.set(liveRecord.hash, {
        ...existing,
        description: existing.description || liveRecord.description,
        imageUrl: existing.imageUrl ?? liveRecord.imageUrl,
        tags: existing.tags?.length ? existing.tags : liveRecord.tags,
        canonicalClaim:
          existing.canonicalClaim && existing.canonicalClaim !== "Claim unavailable."
            ? existing.canonicalClaim
            : liveRecord.canonicalClaim,
        lastSeenAt: liveRecord.lastSeenAt,
      });
    }

    return Array.from(merged.values());
  } catch (err) {
    reportWarn("archive:merge", err);
    return records;
  }
}

export async function getArchivedFeedItemByHash(
  hash: `0x${string}`
): Promise<FeedItem | null> {
  // 1. Redis (fastest, survives cold starts)
  const fromRedis = await redisGetArticle(hash);
  if (fromRedis) return toFeedItem(fromRedis);

  // 2. Remote indexer
  if (getIndexerBackendUrl()) {
    try {
      const record = await fetchRemoteArchivedItem(hash);
      if (record) {
        redisSetArticle(hash, record).catch(() => {});
        return toFeedItem(record);
      }
    } catch (err) {
      reportWarn("archive:remote-lookup", err);
    }
  }

  // 3. Local file
  const archive = await loadArchive();
  const record = archive.items[hash];
  if (!record) return null;
  redisSetArticle(hash, record).catch(() => {});
  return toFeedItem(record);
}

/**
 * Return ALL archived feed items as FeedItem[].
 * Used to expand the related-article search pool beyond live RSS.
 */
export async function getAllArchivedFeedItems(): Promise<FeedItem[]> {
  if (getIndexerBackendUrl()) {
    try {
      const records = await fetchRemoteArchivedItems();
      return records.map(toFeedItem);
    } catch (err) {
      reportWarn("archive:remote-list", err);
    }
  }

  const archive = await loadArchive();
  return Object.values(archive.items).map(toFeedItem);
}

/**
 * Return archived feed items from the local JSON snapshot only.
 * Useful for fast, deterministic read paths like site search where
 * remote archive fetches may exceed serverless time budgets.
 */
export async function getLocalArchivedFeedItems(): Promise<FeedItem[]> {
  const archive = await loadArchive();
  return Object.values(archive.items).map(toFeedItem);
}

/**
 * Return all archived items with their hashes for archive browsing.
 */
export async function getAllArchivedItemsWithHashes(): Promise<
  Array<FeedItem & { hash: string }>
> {
  let records: ArchivedFeedItem[];

  if (getIndexerBackendUrl()) {
    try {
      records = await fetchRemoteArchivedItems();
    } catch (err) {
      reportWarn("archive:remote-list", err);
      const archive = await loadArchive();
      records = Object.values(archive.items);
    }
  } else {
    const archive = await loadArchive();
    records = Object.values(archive.items);
  }

  const merged = await mergeCurrentFeedIntoArchive(records);
  return merged.map((record) => ({
    ...toFeedItem(record),
    hash: record.hash,
  }));
}

// ============================================================================
// AUTO-ARCHIVE: persist live feed items so they survive RSS rotation
// ============================================================================

let saveInFlight: Promise<void> | null = null;

/**
 * Save a single live feed item to the archive.
 * Blocks until the write completes.
 */
export async function autoArchiveItem(item: FeedItem): Promise<void> {
  return autoArchiveBatch([item]);
}

/**
 * Batch-archive many live feed items in one disk write.
 * Called from the front page and article pages to persist feed items.
 * Waits for any in-flight save to complete before starting a new one.
 */
export async function autoArchiveBatch(items: FeedItem[]): Promise<void> {
  if (items.length === 0) return;
  // Wait for any in-flight save to finish before starting a new one
  if (saveInFlight) {
    await saveInFlight.catch(() => {});
  }
  const doSave = async () => {
    try {
      if (getIndexerBackendUrl()) {
        try {
          await upsertRemoteArchivedItems(items);
          return;
        } catch (err) {
          reportWarn("archive:remote-upsert", err);
          // Fall through to local file write
        }
      }

      const archive = await loadArchive();
      const now = new Date().toISOString();
      let newCount = 0;
      let updatedCount = 0;

      for (const item of items) {
        if (!item.link) continue;
        const hash = computeEntityHash(item.link) as `0x${string}`;

        const existing = archive.items[hash];
        if (existing) {
          existing.lastSeenAt = now;
          existing.seenCount = (existing.seenCount || 1) + 1;
          if (!existing.canonicalClaim || existing.canonicalClaim === "Claim unavailable.") {
            existing.canonicalClaim =
              item.canonicalClaim ||
              extractCanonicalClaim({
                title: item.title,
                description: item.description,
                url: item.link,
              });
            updatedCount++;
          }
        } else {
          const canonicalClaim =
            item.canonicalClaim ||
            extractCanonicalClaim({
              title: item.title,
              description: item.description,
              url: item.link,
            });

          archive.items[hash] = {
            hash,
            id: item.id || hash,
            title: item.title,
            link: item.link,
            description: item.description || "",
            pubDate: item.pubDate,
            source: item.source,
            sourceUrl: item.sourceUrl || "",
            category: item.category,
            imageUrl: item.imageUrl ?? undefined,
            bias: item.bias ?? undefined,
            tags: item.tags ?? [],
            canonicalClaim,
            firstSeenAt: now,
            lastSeenAt: now,
            seenCount: 1,
            archivedAt: now,
          };
          newCount++;
        }
      }

      archive.updatedAt = now;
      cache = archive;
      cacheLoadedAtMs = Date.now();

      // Persist to Redis (survives Vercel cold starts + read-only FS)
      if (newCount > 0 || updatedCount > 0) {
        const changedItems = items
          .map((item) => {
            if (!item.link) return null;
            const h = computeEntityHash(item.link) as `0x${string}`;
            return archive.items[h] ?? null;
          })
          .filter((x): x is ArchivedFeedItem => x !== null);
        redisSetArticleBatch(changedItems).catch(() => {});
      }

      // Also write to disk (may fail on Vercel read-only FS)
      if (newCount > 0 || updatedCount > 0) {
        const dir = path.dirname(ARCHIVE_FILE_PATH);
        await mkdir(dir, { recursive: true });
        await writeFile(ARCHIVE_FILE_PATH, JSON.stringify(archive, null, 2), "utf8");
        reportWarn("archive", `+${newCount} new, +${updatedCount} updated (${Object.keys(archive.items).length} total)`);
      }
    } catch (err) {
      reportWarn("archive:auto-save", err);
    } finally {
      saveInFlight = null;
    }
  };

  saveInFlight = doSave();
  await saveInFlight;
}

function deriveSourceLabelFromHost(host: string): string {
  const cleaned = host.replace(/^www\./i, "").trim();
  if (!cleaned) return "Recovered Source";
  const base = cleaned.split(".")[0] || cleaned;
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleFromUrlPath(input: URL): string {
  const raw = input.pathname
    .split("/")
    .filter(Boolean)
    .pop();
  if (!raw) return input.hostname.replace(/^www\./i, "");
  const decoded = decodeURIComponent(raw).replace(/\.[a-z0-9]+$/i, "");
  const words = decoded
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return input.hostname.replace(/^www\./i, "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Recover and archive a single external URL as a FeedItem.
 * Useful when only an onchain entity hash/identifier exists and RSS never saw the link.
 */
export async function archiveUrlAsFeedItem(
  rawUrl: string,
  options: ArchiveFromUrlOptions = {},
): Promise<FeedItem | null> {
  const normalizedInput = normalizeUrl(rawUrl || "");
  if (!normalizedInput) return null;

  let parsedInput: URL;
  try {
    parsedInput = new URL(normalizedInput);
  } catch {
    return null;
  }

  const existing = await getArchivedFeedItemByHash(
    computeEntityHash(normalizedInput) as `0x${string}`,
  );
  if (existing) return existing;

  const verification = await verifyEvidence(normalizedInput);
  if (!verification.safe) {
    reportWarn("archive:url-recovery", `URL recovery blocked: ${verification.reasons?.join("; ")}`);
    return null;
  }

  const canonical = verification.canonicalUrl || verification.normalizedUrl || normalizedInput;
  let canonicalUrl: URL | null = null;
  try {
    canonicalUrl = new URL(canonical);
  } catch {
    canonicalUrl = null;
  }

  const sourceUrl =
    options.sourceUrl ||
    (canonicalUrl
      ? `${canonicalUrl.protocol}//${canonicalUrl.host}`
      : `${parsedInput.protocol}//${parsedInput.host}`);

  const source =
    options.source ||
    deriveSourceLabelFromHost((canonicalUrl || parsedInput).host);

  const title =
    verification.title?.trim() ||
    titleFromUrlPath(canonicalUrl || parsedInput) ||
    "Recovered article";

  const autoDescription =
    canonical && canonical !== normalizedInput
      ? `Recovered from onchain URL. Canonical source: ${canonical}`
      : `Recovered from onchain URL: ${normalizedInput}`;

  const description = (options.description || autoDescription).slice(0, 1200);
  const pubDate = options.pubDate || new Date().toISOString();
  const category = options.category || "Archive";
  const tags = Array.from(
    new Set([...(options.tags || []), "archive", "recovered"]),
  );
  const canonicalClaim =
    extractCanonicalClaim({
      title,
      description,
      url: normalizedInput,
    }) || "Claim unavailable.";

  const feedItem: FeedItem = {
    id: computeEntityHash(normalizedInput),
    title,
    link: normalizedInput,
    description,
    pubDate,
    source,
    sourceUrl,
    category,
    imageUrl: options.imageUrl,
    tags,
    canonicalClaim,
    bias: null,
  };

  await autoArchiveItem(feedItem);
  return feedItem;
}
