/**
 * wallet-flow.ts — Whale wallet flow signal for the composite scorer.
 *
 * Polls known whale wallets on Hyperliquid via clearinghouseState API
 * to determine net long/short exposure per symbol across tracked whales.
 *
 * Signal logic:
 *   - >60% of tracked whales net long with significant size → long signal
 *   - >60% of tracked whales net short with significant size → short signal
 *   - Otherwise → neutral
 *
 * Strength scales with aggregate exposure magnitude relative to total OI.
 * 5-minute cache. Graceful fallback to neutral if API fails.
 */

import type { TraderExecutionConfig } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface WalletFlowSignal {
  source: "wallet-flow";
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  strength: number; // 0-1
  confidence: number; // 0-1
  /** Aggregate USD long exposure minus short exposure across tracked wallets */
  whaleNetExposure: number;
  /** Number of whales currently net long on this symbol */
  whalesLong: number;
  /** Number of whales currently net short on this symbol */
  whalesShort: number;
  /** Number of whales with no position on this symbol */
  whalesNeutral: number;
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

/* ═══════════════════════════  Config  ═══════════════════════════ */

/** Parse whale addresses from env var (comma-separated hex addresses) */
function getWhaleAddresses(): string[] {
  const raw = process.env.WALLET_FLOW_WHALE_ADDRESSES ?? "";
  return raw
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.startsWith("0x") && a.length === 42);
}

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const FETCH_TIMEOUT_MS = 8_000;

/** Minimum number of whales with positions to produce a signal */
const MIN_WHALES_WITH_POSITIONS = 2;

/** Fraction of whales that must agree on direction for a signal (60%) */
const DIRECTION_THRESHOLD = 0.6;

/* ═══════════════════════════  HL API  ═══════════════════════════ */

interface WhalePosition {
  address: string;
  symbol: string;
  sizeUsd: number; // positive = long, negative = short
}

/**
 * Fetch a single whale's clearinghouseState from Hyperliquid.
 * Returns positions for all markets.
 */
async function fetchWhalePositions(
  apiUrl: string,
  address: string,
): Promise<WhalePosition[]> {
  const res = await fetch(`${apiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "clearinghouseState",
      user: address,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HL clearinghouseState ${res.status} for ${address}`);
  }

  const state = (await res.json()) as {
    assetPositions?: Array<{
      position?: {
        coin?: string;
        szi?: string;
        positionValue?: string;
        entryPx?: string;
      };
    }>;
  };

  const positions: WhalePosition[] = [];
  const rawPositions = Array.isArray(state.assetPositions) ? state.assetPositions : [];

  for (const raw of rawPositions) {
    const pos = raw?.position;
    if (!pos) continue;

    const coin = (pos.coin ?? "").trim().toUpperCase();
    const szi = parseFloat(pos.szi ?? "0");
    const entryPx = parseFloat(pos.entryPx ?? "0");
    if (!coin || szi === 0 || entryPx <= 0) continue;

    // szi is signed: positive = long, negative = short
    const sizeUsd = szi * entryPx;

    positions.push({
      address,
      symbol: coin,
      sizeUsd,
    });
  }

  return positions;
}

/* ═══════════════════════════  Main export  ═══════════════════════════ */

/**
 * Fetch whale wallet flow signal for a given symbol.
 *
 * Polls known whale wallets on Hyperliquid, aggregates their net exposure,
 * and produces a directional signal based on whale consensus.
 */
export async function fetchWalletFlowSignal(
  config: TraderExecutionConfig,
  symbol: string,
): Promise<WalletFlowSignal> {
  const CACHE_KEY = `wallet-flow-${symbol}`;
  const cached = getCached<WalletFlowSignal>(CACHE_KEY);
  if (cached) return cached;

  const whaleAddresses = getWhaleAddresses();
  const normalizedSymbol = symbol.replace(/-PERP$/i, "").toUpperCase();

  // No whale addresses configured — return neutral
  if (whaleAddresses.length === 0) {
    const signal = neutralSignal(normalizedSymbol, "No whale addresses configured");
    setCache(CACHE_KEY, signal, CACHE_TTL_MS);
    return signal;
  }

  const apiUrl = config.hyperliquid.apiUrl.replace(/\/+$/, "");

  try {
    // Fetch all whale positions in parallel (with individual error tolerance)
    const results = await Promise.allSettled(
      whaleAddresses.map((addr) => fetchWhalePositions(apiUrl, addr)),
    );

    // Aggregate positions for the target symbol
    let whalesLong = 0;
    let whalesShort = 0;
    let whalesNeutral = 0;
    let totalLongUsd = 0;
    let totalShortUsd = 0;
    let successfulFetches = 0;

    for (const result of results) {
      if (result.status === "rejected") continue;
      successfulFetches++;

      const positions = result.value;
      const match = positions.find((p) => p.symbol === normalizedSymbol);

      if (!match) {
        whalesNeutral++;
      } else if (match.sizeUsd > 0) {
        whalesLong++;
        totalLongUsd += match.sizeUsd;
      } else {
        whalesShort++;
        totalShortUsd += Math.abs(match.sizeUsd);
      }
    }

    // Not enough successful fetches
    if (successfulFetches < MIN_WHALES_WITH_POSITIONS) {
      const signal = neutralSignal(
        normalizedSymbol,
        `Only ${successfulFetches}/${whaleAddresses.length} whale fetches succeeded`,
      );
      setCache(CACHE_KEY, signal, CACHE_TTL_MS);
      return signal;
    }

    const whalesWithPositions = whalesLong + whalesShort;

    // Not enough whales have positions in this market
    if (whalesWithPositions < MIN_WHALES_WITH_POSITIONS) {
      const signal: WalletFlowSignal = {
        source: "wallet-flow",
        symbol: normalizedSymbol,
        timestamp: Date.now(),
        direction: "neutral",
        strength: 0,
        confidence: 0,
        whaleNetExposure: totalLongUsd - totalShortUsd,
        whalesLong,
        whalesShort,
        whalesNeutral,
        reasons: [
          `Whale flow ${normalizedSymbol}: ${whalesWithPositions} whales positioned (need ${MIN_WHALES_WITH_POSITIONS})`,
        ],
      };
      setCache(CACHE_KEY, signal, CACHE_TTL_MS);
      return signal;
    }

    // Determine direction from whale consensus
    const longFraction = whalesLong / whalesWithPositions;
    const shortFraction = whalesShort / whalesWithPositions;
    const netExposure = totalLongUsd - totalShortUsd;

    let direction: "long" | "short" | "neutral" = "neutral";
    let strength = 0;

    if (longFraction >= DIRECTION_THRESHOLD) {
      direction = "long";
      // Strength: how much beyond threshold + size-weighted
      strength = Math.min(1, (longFraction - DIRECTION_THRESHOLD) / (1 - DIRECTION_THRESHOLD) * 0.5 + 0.5);
    } else if (shortFraction >= DIRECTION_THRESHOLD) {
      direction = "short";
      strength = Math.min(1, (shortFraction - DIRECTION_THRESHOLD) / (1 - DIRECTION_THRESHOLD) * 0.5 + 0.5);
    }

    // Confidence scales with number of whales that have positions
    // More whales positioned = higher confidence (max at 5+ whales)
    const confidence = direction === "neutral"
      ? 0
      : Math.min(0.7, 0.3 + (whalesWithPositions / Math.max(whaleAddresses.length, 5)) * 0.4);

    const signal: WalletFlowSignal = {
      source: "wallet-flow",
      symbol: normalizedSymbol,
      timestamp: Date.now(),
      direction,
      strength,
      confidence,
      whaleNetExposure: netExposure,
      whalesLong,
      whalesShort,
      whalesNeutral,
      reasons: [
        `Whale flow ${normalizedSymbol}: ${whalesLong}L/${whalesShort}S/${whalesNeutral}N` +
          ` (${(longFraction * 100).toFixed(0)}% long)` +
          ` net=$${netExposure > 0 ? "+" : ""}${(netExposure / 1000).toFixed(1)}k` +
          ` → ${direction}`,
      ],
    };

    setCache(CACHE_KEY, signal, CACHE_TTL_MS);
    return signal;
  } catch (err) {
    console.warn(
      `[wallet-flow] Whale flow fetch failed for ${normalizedSymbol}:`,
      err instanceof Error ? err.message : err,
    );
    const signal = neutralSignal(normalizedSymbol, "Whale flow fetch failed");
    setCache(CACHE_KEY, signal, CACHE_TTL_MS);
    return signal;
  }
}

/* ═══════════════════════════  Helpers  ═══════════════════════════ */

function neutralSignal(symbol: string, reason: string): WalletFlowSignal {
  return {
    source: "wallet-flow",
    symbol,
    timestamp: Date.now(),
    direction: "neutral",
    strength: 0,
    confidence: 0,
    whaleNetExposure: 0,
    whalesLong: 0,
    whalesShort: 0,
    whalesNeutral: 0,
    reasons: [`Whale flow ${symbol}: ${reason}`],
  };
}
