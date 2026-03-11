#!/usr/bin/env node

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_PATH = process.env.ARCHIVE_FILE_PATH
  ? path.resolve(process.env.ARCHIVE_FILE_PATH)
  : path.join(__dirname, "../src/data/article-archive.json");
const FEED_URL = process.env.ARCHIVE_FEED_URL || "https://pooter.world/api/feed";

const nowIso = new Date().toISOString();
const URL_REGEX = /https?:\/\/[^\s"'<>`]+/gi;

function emptyArchive() {
  return {
    version: 1,
    updatedAt: "",
    items: {},
  };
}

async function loadArchive() {
  try {
    const raw = await readFile(ARCHIVE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.items) {
      return emptyArchive();
    }
    return parsed;
  } catch {
    return emptyArchive();
  }
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.link !== "string" || item.link.length === 0) return null;

  const hash = keccak256(toBytes(item.link));
  return {
    hash,
    id: typeof item.id === "string" ? item.id : hash,
    title: typeof item.title === "string" ? item.title : "",
    link: item.link,
    description: typeof item.description === "string" ? item.description : "",
    pubDate: typeof item.pubDate === "string" ? item.pubDate : nowIso,
    source: typeof item.source === "string" ? item.source : "Unknown",
    sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
    category: typeof item.category === "string" ? item.category : "World",
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
    bias: item.bias ?? null,
    tags: Array.isArray(item.tags)
      ? item.tags.filter((t) => typeof t === "string")
      : [],
    preservedLinks: collectLinks(item),
  };
}

function collectLinks(item) {
  const links = new Set();

  if (typeof item.link === "string" && item.link.length > 0) {
    links.add(item.link);
  }
  if (typeof item.sourceUrl === "string" && item.sourceUrl.length > 0) {
    links.add(item.sourceUrl);
  }
  if (typeof item.imageUrl === "string" && item.imageUrl.length > 0) {
    links.add(item.imageUrl);
  }
  if (typeof item.description === "string" && item.description.length > 0) {
    const matches = item.description.match(URL_REGEX) || [];
    for (const match of matches) {
      links.add(match);
    }
  }

  return Array.from(links);
}

function mergeUniqueStrings(...lists) {
  const merged = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry === "string" && entry.length > 0) {
        merged.add(entry);
      }
    }
  }
  return Array.from(merged);
}

async function main() {
  const archive = await loadArchive();

  const response = await fetch(FEED_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${FEED_URL}: ${response.status}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];

  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const normalized = normalizeItem(item);
    if (!normalized) continue;

    const existing = archive.items[normalized.hash];
    if (existing) {
      archive.items[normalized.hash] = {
        ...existing,
        ...normalized,
        sourceUrl: normalized.sourceUrl || existing.sourceUrl || "",
        imageUrl: normalized.imageUrl || existing.imageUrl || undefined,
        tags: mergeUniqueStrings(existing.tags, normalized.tags),
        preservedLinks: mergeUniqueStrings(
          existing.preservedLinks,
          normalized.preservedLinks
        ),
        firstSeenAt: existing.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        seenCount: Number(existing.seenCount || 0) + 1,
        archivedAt: existing.archivedAt || nowIso,
      };
      updated += 1;
    } else {
      archive.items[normalized.hash] = {
        ...normalized,
        preservedLinks: mergeUniqueStrings(normalized.preservedLinks),
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        seenCount: 1,
        archivedAt: nowIso,
      };
      inserted += 1;
    }
  }

  archive.version = 1;
  archive.updatedAt = nowIso;

  await mkdir(path.dirname(ARCHIVE_PATH), { recursive: true });
  await writeFile(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`, "utf8");

  const total = Object.keys(archive.items).length;
  console.log(
    `[archive] total=${total} inserted=${inserted} updated=${updated} source_items=${items.length}`
  );
}

main().catch((error) => {
  console.error("[archive] snapshot failed:", error);
  process.exit(1);
});
