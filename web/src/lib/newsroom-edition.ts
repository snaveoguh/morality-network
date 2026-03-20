import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// ============================================================================
// NEWSROOM EDITION TRACKER
// Tracks which articles are "published by the newsroom" each day.
// Same persistence pattern as editorial-archive.ts: JSON file + in-memory cache.
// ============================================================================

export interface NewsroomStory {
  entityHash: string;
  title: string;
  category: string;
  source: string;
  score: number;
  isBreaking: boolean;
  clusterSize: number;
  generatedAt: string;
}

export interface NewsroomEdition {
  date: string;          // YYYY-MM-DD
  generatedAt: string;   // ISO timestamp of first generation
  updatedAt: string;     // ISO timestamp of last update
  stories: NewsroomStory[];
}

interface NewsroomEditionsFile {
  version: 1;
  editions: Record<string, NewsroomEdition>;
}

const EDITIONS_FILE_PATH = path.join(
  process.cwd(),
  "src/data/newsroom-editions.json",
);

const EMPTY_FILE: NewsroomEditionsFile = {
  version: 1,
  editions: {},
};

let cache: NewsroomEditionsFile | null = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 30_000;

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadFile(): Promise<NewsroomEditionsFile> {
  if (cache && Date.now() - cacheLoadedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const raw = await readFile(EDITIONS_FILE_PATH, "utf-8");
    cache = JSON.parse(raw) as NewsroomEditionsFile;
    cacheLoadedAtMs = Date.now();
    return cache;
  } catch {
    cache = { ...EMPTY_FILE };
    cacheLoadedAtMs = Date.now();
    return cache;
  }
}

let writeLock: Promise<void> | null = null;

async function saveFile(data: NewsroomEditionsFile): Promise<void> {
  // Serialize writes
  while (writeLock) await writeLock;

  let unlock: () => void;
  writeLock = new Promise((resolve) => { unlock = resolve; });

  try {
    await mkdir(path.dirname(EDITIONS_FILE_PATH), { recursive: true });
    await writeFile(EDITIONS_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    // Vercel serverless has a read-only filesystem — just keep in-memory cache
    console.warn("[newsroom-edition] file write failed (read-only fs?):", err instanceof Error ? err.message : err);
  }

  // Always update in-memory cache regardless of file write success
  cache = data;
  cacheLoadedAtMs = Date.now();

  writeLock = null;
  unlock!();
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function getNewsroomEdition(
  date?: string,
): Promise<NewsroomEdition | null> {
  const d = date ?? getTodayUTC();
  const file = await loadFile();
  return file.editions[d] ?? null;
}

export async function saveNewsroomEdition(
  edition: NewsroomEdition,
): Promise<void> {
  const file = await loadFile();
  file.editions[edition.date] = edition;

  // Prune editions older than 14 days to keep file small
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const key of Object.keys(file.editions)) {
    if (key < cutoffStr) {
      delete file.editions[key];
    }
  }

  await saveFile(file);
}

export async function getTodayPublishedHashes(): Promise<Set<string>> {
  const edition = await getNewsroomEdition();
  if (!edition) return new Set();
  return new Set(edition.stories.map((s) => s.entityHash));
}

export async function addStoryToEdition(
  date: string,
  story: NewsroomStory,
): Promise<void> {
  const file = await loadFile();
  const existing = file.editions[date];

  if (existing) {
    // Don't add duplicates
    if (existing.stories.some((s) => s.entityHash === story.entityHash)) return;
    existing.stories.push(story);
    existing.updatedAt = new Date().toISOString();
  } else {
    file.editions[date] = {
      date,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stories: [story],
    };
  }

  await saveFile(file);
}
