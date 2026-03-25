/**
 * market-signals.ts — External market data signals for the composite scorer.
 *
 * Sources:
 *   1. Fear & Greed Index (Alternative.me — free, no auth)
 *   2. HyperLiquid funding rates (contrarian signal)
 *   3. HyperLiquid open interest changes (volatility signal)
 *
 * All signals return { direction, strength, confidence } for the composite scorer.
 */

import type { TraderExecutionConfig } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface MarketDataSignal {
  source: string;
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  strength: number; // 0-1
  confidence: number; // 0-1
  value: number; // raw value for logging
  reasons: string[];
}

/* ═══════════════════════════  Cache  ═══════════════════════════ */

interface CachedValue<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CachedValue<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/* ═══════════════════  1. Fear & Greed Index  ═══════════════════ */

interface FearGreedResponse {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

/**
 * Fetch the crypto Fear & Greed index from Alternative.me (free, no auth).
 * Value: 0 = extreme fear, 100 = extreme greed.
 *
 * Signal logic (contrarian):
 *   - Extreme fear (< 25) → long (market oversold, bounce expected)
 *   - Fear (25-45) → mild long
 *   - Neutral (45-55) → neutral
 *   - Greed (55-75) → mild short
 *   - Extreme greed (> 75) → short (market overheated, correction expected)
 */
export async function fetchFearGreedSignal(): Promise<MarketDataSignal> {
  const CACHE_KEY = "fear-greed";
  const cached = getCached<MarketDataSignal>(CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1&format=json", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`FNG API ${res.status}`);

    const body = (await res.json()) as FearGreedResponse;
    const current = body.data?.[0];
    if (!current) throw new Error("No FNG data");

    const value = parseInt(current.value, 10);
    const classification = current.value_classification;

    let direction: "long" | "short" | "neutral" = "neutral";
    let strength = 0;

    if (value < 25) {
      direction = "long";
      strength = (25 - value) / 25; // 0→1 as value goes 25→0
    } else if (value < 45) {
      direction = "long";
      strength = (45 - value) / 40; // mild
    } else if (value > 75) {
      direction = "short";
      strength = (value - 75) / 25; // 0→1 as value goes 75→100
    } else if (value > 55) {
      direction = "short";
      strength = (value - 55) / 40; // mild
    }

    const signal: MarketDataSignal = {
      source: "fear-greed",
      symbol: "MARKET",
      timestamp: Date.now(),
      direction,
      strength: Math.min(1, strength),
      confidence: 0.6, // moderate — it's a lagging indicator
      value,
      reasons: [`Fear & Greed: ${value}/100 (${classification}) → contrarian ${direction}`],
    };

    setCache(CACHE_KEY, signal, 30 * 60_000); // 30min cache
    return signal;
  } catch (err) {
    console.warn("[market-signals] Fear & Greed fetch failed:", err instanceof Error ? err.message : err);
    return {
      source: "fear-greed",
      symbol: "MARKET",
      timestamp: Date.now(),
      direction: "neutral",
      strength: 0,
      confidence: 0,
      value: 50,
      reasons: ["Fear & Greed: unavailable"],
    };
  }
}

/* ═══════════════════  2. HL Funding Rates  ═══════════════════ */

interface HLFundingResponse {
  [coin: string]: {
    funding: string;
    premium: string;
  };
}

/**
 * Fetch current funding rates from HyperLiquid.
 * High positive funding → crowded long → contrarian short.
 * High negative funding → crowded short → contrarian long.
 *
 * Thresholds (annualized):
 *   - |funding| < 0.001% (8h) ≈ 1% annual → neutral
 *   - |funding| > 0.01% (8h) ≈ 10% annual → moderate signal
 *   - |funding| > 0.05% (8h) ≈ 50% annual → strong signal
 */
export async function fetchFundingRateSignal(
  _config: TraderExecutionConfig,
  symbol: string,
): Promise<MarketDataSignal> {
  const CACHE_KEY = `funding-${symbol}`;
  const cached = getCached<MarketDataSignal>(CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HL funding API ${res.status}`);

    const body = await res.json() as [
      { universe: Array<{ name: string }> },
      Array<{ funding: string; premium: string; openInterest: string }>
    ];

    const [meta, assetCtxs] = body;
    const assetIndex = meta.universe.findIndex(
      (u) => u.name.toUpperCase() === symbol.replace(/-PERP$/i, "").toUpperCase()
    );

    if (assetIndex === -1 || !assetCtxs[assetIndex]) {
      throw new Error(`No funding data for ${symbol}`);
    }

    const funding = parseFloat(assetCtxs[assetIndex].funding);

    // Funding is per 8h. Convert to signal.
    let direction: "long" | "short" | "neutral" = "neutral";
    let strength = 0;
    const absFunding = Math.abs(funding);

    if (absFunding > 0.0001) { // > 0.01% per 8h
      // Contrarian: positive funding (longs pay) → short signal
      direction = funding > 0 ? "short" : "long";
      // Scale: 0.01% → 0 strength, 0.05% → 1 strength
      strength = Math.min(1, (absFunding - 0.0001) / 0.0004);
    }

    const annualized = funding * 3 * 365 * 100; // 3x per day × 365 days × 100 for %

    const signal: MarketDataSignal = {
      source: "hl-funding",
      symbol,
      timestamp: Date.now(),
      direction,
      strength,
      confidence: 0.5, // moderate — funding can persist for long periods
      value: funding,
      reasons: [`Funding ${symbol}: ${(funding * 100).toFixed(4)}%/8h (${annualized.toFixed(1)}% ann.) → contrarian ${direction}`],
    };

    setCache(CACHE_KEY, signal, 5 * 60_000); // 5min cache (funding updates frequently)
    return signal;
  } catch (err) {
    console.warn(`[market-signals] Funding rate fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return {
      source: "hl-funding",
      symbol,
      timestamp: Date.now(),
      direction: "neutral",
      strength: 0,
      confidence: 0,
      value: 0,
      reasons: [`Funding ${symbol}: unavailable`],
    };
  }
}

/* ═══════════════════  3. HL Open Interest  ═══════════════════ */

// In-memory fallback for OI baselines (used when Redis is unavailable)
const prevOI = new Map<string, { oi: number; ts: number }>();

/* ── Upstash Redis persistence for OI baselines (survives serverless cold starts) ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const OI_REDIS_KEY = "pooter:oi-baselines";

function oiRedisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function loadOIBaseline(symbol: string): Promise<{ oi: number; ts: number } | null> {
  // Check in-memory first (hot path within same invocation)
  const mem = prevOI.get(symbol);
  if (mem) return mem;

  if (!oiRedisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/hget/${OI_REDIS_KEY}/${symbol}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { result: string | null };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result) as { oi: number; ts: number };
    if (typeof parsed.oi === "number" && typeof parsed.ts === "number") {
      prevOI.set(symbol, parsed); // warm in-memory cache
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveOIBaseline(symbol: string, oi: number, ts: number): Promise<void> {
  const entry = { oi, ts };
  prevOI.set(symbol, entry);

  if (!oiRedisEnabled()) return;
  try {
    await fetch(UPSTASH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["HSET", OI_REDIS_KEY, symbol, JSON.stringify(entry)]),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Non-fatal — in-memory fallback still works within this invocation
  }
}

/**
 * Fetch open interest from HyperLiquid and detect significant changes.
 * Rising OI + rising price → trend confirmation (long)
 * Rising OI + falling price → bearish pressure (short)
 * Falling OI → position unwinding → neutral/reduce confidence
 *
 * Uses metaAndAssetCtxs endpoint (same as funding — combined to share cache).
 *
 * OI baselines are persisted to Upstash Redis so they survive serverless
 * cold starts. Without this, OI always returns neutral on the first
 * invocation because the in-memory baseline is lost between deploys.
 */
export async function fetchOpenInterestSignal(
  _config: TraderExecutionConfig,
  symbol: string,
): Promise<MarketDataSignal> {
  const CACHE_KEY = `oi-${symbol}`;
  const cached = getCached<MarketDataSignal>(CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HL OI API ${res.status}`);

    const body = await res.json() as [
      { universe: Array<{ name: string }> },
      Array<{ openInterest: string; markPx: string; funding: string }>
    ];

    const [meta, assetCtxs] = body;
    const assetIndex = meta.universe.findIndex(
      (u) => u.name.toUpperCase() === symbol.replace(/-PERP$/i, "").toUpperCase()
    );

    if (assetIndex === -1 || !assetCtxs[assetIndex]) {
      throw new Error(`No OI data for ${symbol}`);
    }

    const currentOI = parseFloat(assetCtxs[assetIndex].openInterest);
    const markPx = parseFloat(assetCtxs[assetIndex].markPx);
    const funding = parseFloat(assetCtxs[assetIndex].funding);

    // Compare with previous reading (Redis-backed, survives cold starts)
    const prev = await loadOIBaseline(symbol);
    await saveOIBaseline(symbol, currentOI, Date.now());

    if (!prev || Date.now() - prev.ts > 30 * 60_000) {
      // First reading or stale — can't compute change
      const signal: MarketDataSignal = {
        source: "hl-oi",
        symbol,
        timestamp: Date.now(),
        direction: "neutral",
        strength: 0,
        confidence: 0,
        value: currentOI,
        reasons: [`OI ${symbol}: $${(currentOI * markPx).toFixed(0)} (baseline — no change data yet)`],
      };
      setCache(CACHE_KEY, signal, 3 * 60_000);
      return signal;
    }

    const oiChange = (currentOI - prev.oi) / prev.oi;
    const oiChangePct = oiChange * 100;

    // Combine OI change with funding direction for signal
    let direction: "long" | "short" | "neutral" = "neutral";
    let strength = 0;
    const absChange = Math.abs(oiChange);

    if (absChange > 0.02) { // >2% OI change
      if (oiChange > 0) {
        // OI rising — trend building
        // Positive funding = longs dominating → trend is long
        // Negative funding = shorts dominating → trend is short
        direction = funding > 0 ? "long" : "short";
        strength = Math.min(1, absChange / 0.10); // 10% change = max strength
      } else {
        // OI falling — position unwinding, reduce conviction
        direction = "neutral";
        strength = 0;
      }
    }

    const signal: MarketDataSignal = {
      source: "hl-oi",
      symbol,
      timestamp: Date.now(),
      direction,
      strength,
      confidence: 0.4, // lower confidence — OI is a supporting indicator
      value: currentOI,
      reasons: [
        `OI ${symbol}: ${oiChangePct > 0 ? "+" : ""}${oiChangePct.toFixed(2)}% change`,
        `→ ${oiChange > 0 ? "building" : "unwinding"} ${direction}`,
      ],
    };

    setCache(CACHE_KEY, signal, 3 * 60_000); // 3min cache
    return signal;
  } catch (err) {
    console.warn(`[market-signals] OI fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return {
      source: "hl-oi",
      symbol,
      timestamp: Date.now(),
      direction: "neutral",
      strength: 0,
      confidence: 0,
      value: 0,
      reasons: [`OI ${symbol}: unavailable`],
    };
  }
}

/* ═══════════════════  Aggregated fetch  ═══════════════════ */

export interface MarketDataBundle {
  fearGreed: MarketDataSignal;
  funding: MarketDataSignal;
  openInterest: MarketDataSignal;
}

/**
 * Fetch all market data signals for a symbol in parallel.
 */
export async function fetchMarketDataSignals(
  config: TraderExecutionConfig,
  symbol: string,
): Promise<MarketDataBundle> {
  const [fearGreed, funding, openInterest] = await Promise.all([
    fetchFearGreedSignal(),
    fetchFundingRateSignal(config, symbol),
    fetchOpenInterestSignal(config, symbol),
  ]);

  return { fearGreed, funding, openInterest };
}
