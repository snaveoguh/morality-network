/**
 * deliberation.ts — Structured deliberation records for the trading council.
 *
 * Replaces the simple vote-tally model with argument-quality-driven decision-making.
 * Each analyst persona produces a thesis, cites data points, names what would
 * falsify their position, and optionally rebuts another persona. The winning
 * thesis is determined by argument quality, not vote count.
 *
 * Persistence: Upstash Redis REST (same pattern as editorial-archive.ts).
 */

import { reportWarn } from "../report-error";

/* ═══════════════════════  Types  ═══════════════════════ */

export interface DeliberationArgument {
  persona: string;
  position: "LONG" | "SHORT" | "HOLD";
  conviction: number; // 0-100
  thesis: string; // 2-3 sentence argument
  dataPoints: string[]; // specific numbers cited (e.g. "RSI 42.3", "funding +0.04%")
  counterToPersona: string | null; // which persona this rebuts
  vulnerabilities: string[]; // what would falsify this argument
}

export interface DeliberationWinningThesis {
  position: "LONG" | "SHORT" | "HOLD";
  argumentQuality: number; // 0-1
  summary: string; // 2-3 sentences
  keyContention: string; // the main disagreement
}

export interface DeliberationMarketContext {
  technicalDirection: string | null;
  newsDirection: string | null;
  fundingRate: number | null;
  fearGreedIndex: number | null;
  walletFlowDirection: string | null;
}

export interface DeliberationOutcome {
  priceAtCheck: number;
  wasCorrect: boolean;
  checkedAt: string;
}

export interface DeliberationRecord {
  id: string;
  symbol: string;
  price: number;
  timestamp: number;
  arguments: DeliberationArgument[];
  winningThesis: DeliberationWinningThesis;
  marketContext: DeliberationMarketContext;
  falsifiableAt?: string; // ISO timestamp
  outcome?: DeliberationOutcome;
}

/* ═══════════════════════  Argument Quality Scoring  ═══════════════════════ */

/**
 * Score the quality of a deliberation based on argument specificity,
 * counter-argument presence, and vulnerability concreteness.
 */
export function computeArgumentQuality(args: DeliberationArgument[]): number {
  if (!args.length) return 0;

  // 1. Data point specificity — count unique, concrete data points across all arguments
  const allDataPoints = args.flatMap((a) => a.dataPoints);
  const uniqueDataPoints = new Set(allDataPoints).size;
  const dataPointScore = Math.min(1, uniqueDataPoints / 12); // 12+ data points = perfect

  // 2. Counter-argument presence — at least one persona rebuts another
  const hasCounterArgument = args.some((a) => a.counterToPersona !== null);
  const counterScore = hasCounterArgument ? 1 : 0;

  // 3. Vulnerability concreteness — falsification conditions are specific, not vague
  const allVulnerabilities = args.flatMap((a) => a.vulnerabilities);
  const concreteVulnerabilities = allVulnerabilities.filter(
    (v) => /\d/.test(v) || /\b(below|above|breaks?|crosses?|drops?|falls?)\b/i.test(v),
  );
  const vulnerabilityScore =
    allVulnerabilities.length > 0 ? concreteVulnerabilities.length / allVulnerabilities.length : 0;

  // Weighted combination: data 40%, counters 30%, vulnerabilities 30%
  return dataPointScore * 0.4 + counterScore * 0.3 + vulnerabilityScore * 0.3;
}

/* ═══════════════════════  Redis Persistence  ═══════════════════════ */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_DELIBERATION_PREFIX = "pooter:deliberation:";
const REDIS_DELIBERATION_LATEST_PREFIX = "pooter:deliberation:latest:";
const REDIS_DELIBERATION_LIST_PREFIX = "pooter:deliberation:list:";

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisPipeline(commands: string[][]): Promise<void> {
  if (!redisEnabled()) return;
  try {
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
    reportWarn("deliberation:redis-pipeline", e);
  }
}

async function redisGet<T>(key: string): Promise<T | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    return JSON.parse(body.result) as T;
  } catch {
    return null;
  }
}

async function redisLRange<T>(key: string, start: number, stop: number): Promise<T[]> {
  if (!redisEnabled()) return [];
  try {
    const res = await fetch(`${UPSTASH_URL}/lrange/${key}/${start}/${stop}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { result?: string[] };
    if (!body.result || !Array.isArray(body.result)) return [];
    return body.result.map((s) => JSON.parse(s) as T);
  } catch {
    return [];
  }
}

/**
 * Save a deliberation record to Redis with dual indexing:
 * - latest:{symbol} — quick lookup for current deliberation (24h TTL)
 * - list:{symbol} — append to history list (7-day TTL per entry)
 */
export async function saveDeliberationRecord(record: DeliberationRecord): Promise<void> {
  const serialized = JSON.stringify(record);
  const latestKey = `${REDIS_DELIBERATION_LATEST_PREFIX}${record.symbol}`;
  const listKey = `${REDIS_DELIBERATION_LIST_PREFIX}${record.symbol}`;
  const dateKey = `${REDIS_DELIBERATION_PREFIX}${record.symbol}:${new Date(record.timestamp).toISOString().slice(0, 10)}`;

  await redisPipeline([
    ["SET", latestKey, serialized, "EX", "86400"], // 24h
    ["SET", dateKey, serialized, "EX", "604800"], // 7 days
    ["LPUSH", listKey, serialized],
    ["LTRIM", listKey, "0", "29"], // keep last 30
    ["EXPIRE", listKey, "604800"], // 7 days
  ]);

  console.log(
    `[deliberation] Saved ${record.symbol}: ${record.winningThesis.position} quality=${record.winningThesis.argumentQuality.toFixed(2)}`,
  );
}

/**
 * Get the latest deliberation for a symbol.
 */
export async function getLatestDeliberation(symbol: string): Promise<DeliberationRecord | null> {
  return redisGet<DeliberationRecord>(`${REDIS_DELIBERATION_LATEST_PREFIX}${symbol}`);
}

/**
 * Get recent deliberation history for a symbol.
 */
export async function getDeliberationHistory(
  symbol: string,
  count: number = 10,
): Promise<DeliberationRecord[]> {
  return redisLRange<DeliberationRecord>(
    `${REDIS_DELIBERATION_LIST_PREFIX}${symbol}`,
    0,
    count - 1,
  );
}

/**
 * Record the outcome of a deliberation (was the thesis correct?).
 */
export async function recordDeliberationOutcome(
  symbol: string,
  date: string,
  priceAtCheck: number,
): Promise<void> {
  const dateKey = `${REDIS_DELIBERATION_PREFIX}${symbol}:${date}`;
  const record = await redisGet<DeliberationRecord>(dateKey);
  if (!record) return;

  const wasLong = record.winningThesis.position === "LONG";
  const wasShort = record.winningThesis.position === "SHORT";
  const priceRose = priceAtCheck > record.price;
  const wasCorrect = (wasLong && priceRose) || (wasShort && !priceRose) || record.winningThesis.position === "HOLD";

  record.outcome = {
    priceAtCheck,
    wasCorrect,
    checkedAt: new Date().toISOString(),
  };

  await redisPipeline([
    ["SET", dateKey, JSON.stringify(record), "EX", "604800"],
  ]);

  console.log(
    `[deliberation] Outcome ${symbol} ${date}: ${record.winningThesis.position} was ${wasCorrect ? "CORRECT" : "WRONG"} ` +
    `(entry $${record.price.toFixed(2)} → check $${priceAtCheck.toFixed(2)})`,
  );
}

/* ═══════════════════════  In-memory fallback cache  ═══════════════════════ */

const memoryCache = new Map<string, { record: DeliberationRecord; expiresAt: number }>();
const MEMORY_CACHE_TTL_MS = 15 * 60_000; // 15 min fallback

/**
 * Save to in-memory cache (used when Redis unavailable).
 */
export function cacheDeliberation(record: DeliberationRecord): void {
  memoryCache.set(record.symbol, { record, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });
}

/**
 * Get from in-memory cache (used when Redis unavailable).
 */
export function getCachedDeliberation(symbol: string): DeliberationRecord | null {
  const entry = memoryCache.get(symbol);
  if (!entry || Date.now() > entry.expiresAt) {
    memoryCache.delete(symbol);
    return null;
  }
  return entry.record;
}
