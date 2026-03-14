import "server-only";

import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { SentimentSnapshot } from "./sentiment";

// ============================================================================
// SCORE HISTORY — Lightweight time-series persistence for trend computation
//
// Stores globalScore + per-topic scores at each ISR cycle (every ~5 min).
// 30-day rolling window, ~8,640 entries max, ~1.7 MB JSON file.
// Follows the archive.ts persistence pattern (in-memory cache + JSON on disk).
// ============================================================================

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScoreHistoryEntry {
  /** ISO timestamp */
  t: string;
  /** globalScore (0-100) */
  g: number;
  /** topic slug → score */
  s: Record<string, number>;
}

interface ScoreHistoryFile {
  version: 1;
  entries: ScoreHistoryEntry[];
}

export type TrendRange = "1D" | "3D" | "1W" | "1M";

export const RANGE_MS: Record<TrendRange, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "3D": 3 * 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

// ── File paths & caching ────────────────────────────────────────────────────

const HISTORY_FILE_PATH = path.join(process.cwd(), "src/data/score-history.json");
const EMPTY_HISTORY: ScoreHistoryFile = { version: 1, entries: [] };

let cache: ScoreHistoryFile | null = null;
let cacheLoadedAtMs = 0;
const CACHE_TTL_MS = 30_000;

/** Minimum gap between recorded entries (prevents double-writes from page + API). */
const MIN_RECORD_GAP_MS = 4 * 60 * 1000; // 4 minutes

/** Maximum age for entries (30 days). */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let saveInFlight = false;

// ── Load ────────────────────────────────────────────────────────────────────

export async function loadHistory(): Promise<ScoreHistoryFile> {
  const now = Date.now();
  if (cache && now - cacheLoadedAtMs < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const raw = await readFile(HISTORY_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ScoreHistoryFile>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.entries)
    ) {
      cache = EMPTY_HISTORY;
    } else {
      cache = { version: 1, entries: parsed.entries };
    }
  } catch {
    // File doesn't exist yet — that's fine
    cache = EMPTY_HISTORY;
  }

  cacheLoadedAtMs = now;
  return cache;
}

// ── Record ──────────────────────────────────────────────────────────────────

/**
 * Append a snapshot's scores to the history file.
 * Fire-and-forget — never blocks the caller, never throws.
 */
export async function recordSnapshot(snapshot: SentimentSnapshot): Promise<void> {
  if (saveInFlight) return;

  try {
    const history = await loadHistory();
    const now = Date.now();

    // Dedup: skip if last entry is too recent
    if (history.entries.length > 0) {
      const lastEntry = history.entries[history.entries.length - 1];
      const lastTime = new Date(lastEntry.t).getTime();
      if (now - lastTime < MIN_RECORD_GAP_MS) return;
    }

    // Build the entry
    const entry: ScoreHistoryEntry = {
      t: snapshot.generatedAt,
      g: snapshot.globalScore,
      s: {},
    };
    for (const topic of snapshot.topics) {
      entry.s[topic.slug] = topic.score;
    }

    // Append and prune
    history.entries.push(entry);
    const cutoff = now - MAX_AGE_MS;
    const firstKeepIdx = history.entries.findIndex(
      (e) => new Date(e.t).getTime() >= cutoff,
    );
    if (firstKeepIdx > 0) {
      history.entries.splice(0, firstKeepIdx);
    }

    // Write to disk
    saveInFlight = true;
    const dir = path.dirname(HISTORY_FILE_PATH);
    await mkdir(dir, { recursive: true });
    await writeFile(
      HISTORY_FILE_PATH,
      JSON.stringify(history, null, 0),
      "utf8",
    );

    // Update in-memory cache
    cache = history;
    cacheLoadedAtMs = Date.now();
  } catch (err) {
    console.error("[score-history] failed to record snapshot:", err);
  } finally {
    saveInFlight = false;
  }
}

// ── Query helpers ───────────────────────────────────────────────────────────

/**
 * Binary search for the entry closest to a target timestamp.
 * Returns null if no entries exist or closest entry is > 15 min from target.
 */
export function getScoreAtTime(
  entries: ScoreHistoryEntry[],
  targetMs: number,
): ScoreHistoryEntry | null {
  if (entries.length === 0) return null;

  let lo = 0;
  let hi = entries.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midTime = new Date(entries[mid].t).getTime();
    if (midTime < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // lo is the first entry >= targetMs, check it and lo-1
  const candidates: ScoreHistoryEntry[] = [];
  if (lo < entries.length) candidates.push(entries[lo]);
  if (lo > 0) candidates.push(entries[lo - 1]);

  let best: ScoreHistoryEntry | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = Math.abs(new Date(c.t).getTime() - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  // Tolerance: don't return entries too far from target.
  // For "1D" range we need entries ~24h old, so tolerance should be generous.
  // Use 10% of the range or 30 min, whichever is larger.
  const MAX_TOLERANCE_MS = 30 * 60 * 1000; // 30 minutes
  if (bestDist > MAX_TOLERANCE_MS) return null;

  return best;
}

/**
 * Get boundary scores for all time ranges.
 */
export function getBoundaryScores(
  entries: ScoreHistoryEntry[],
): Record<TrendRange, ScoreHistoryEntry | null> {
  const now = Date.now();
  const result = {} as Record<TrendRange, ScoreHistoryEntry | null>;

  for (const range of ["1D", "3D", "1W", "1M"] as TrendRange[]) {
    const targetMs = now - RANGE_MS[range];
    result[range] = getScoreAtTime(entries, targetMs);
  }

  return result;
}

/**
 * Compute percentage trend: ((current - past) / past) * 100.
 * Returns null if past is null or zero.
 */
export function computePercentTrend(
  current: number,
  past: number | null,
): number | null {
  if (past === null || past === 0) return null;
  return ((current - past) / past) * 100;
}
