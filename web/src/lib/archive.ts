import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { FeedItem } from "./rss";
import { computeEntityHash } from "./entity";
import { extractCanonicalClaim } from "./claim-extract";
import { normalizeUrl, verifyEvidence } from "./evidence-verify";

interface ArchivedFeedItem {
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

export async function getArchivedFeedItemByHash(
  hash: `0x${string}`
): Promise<FeedItem | null> {
  const archive = await loadArchive();
  const record = archive.items[hash];
  if (!record) return null;
  return toFeedItem(record);
}

/**
 * Return ALL archived feed items as FeedItem[].
 * Used to expand the related-article search pool beyond live RSS.
 */
export async function getAllArchivedFeedItems(): Promise<FeedItem[]> {
  const archive = await loadArchive();
  return Object.values(archive.items).map(toFeedItem);
}

/**
 * Return all archived items with their hashes for archive browsing.
 */
export async function getAllArchivedItemsWithHashes(): Promise<
  Array<FeedItem & { hash: string }>
> {
  const archive = await loadArchive();
  return Object.entries(archive.items).map(([hash, record]) => ({
    ...toFeedItem(record),
    hash,
  }));
}

// ============================================================================
// AUTO-ARCHIVE: persist live feed items so they survive RSS rotation
// ============================================================================

let saveInFlight = false;

/**
 * Save a single live feed item to the archive.
 * Fire-and-forget — never blocks the caller, never throws.
 */
export async function autoArchiveItem(item: FeedItem): Promise<void> {
  return autoArchiveBatch([item]);
}

/**
 * Batch-archive many live feed items in one disk write.
 * Called from the front page to persist the entire current feed.
 * Skips write if nothing is new (only updates lastSeenAt in memory).
 */
export async function autoArchiveBatch(items: FeedItem[]): Promise<void> {
  if (saveInFlight || items.length === 0) return;
  try {
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

    // Only write to disk if we actually added new items
    if (newCount > 0 || updatedCount > 0) {
      saveInFlight = true;
      const dir = path.dirname(ARCHIVE_FILE_PATH);
      await mkdir(dir, { recursive: true });
      await writeFile(ARCHIVE_FILE_PATH, JSON.stringify(archive, null, 2), "utf8");
      console.log(
        `[archive] +${newCount} new, +${updatedCount} updated (${Object.keys(archive.items).length} total)`
      );
    }
  } catch (err) {
    console.warn("[archive] auto-save failed:", err);
  } finally {
    saveInFlight = false;
  }
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
    console.warn("[archive] URL recovery blocked:", verification.reasons?.join("; "));
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
