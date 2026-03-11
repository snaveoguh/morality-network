/**
 * Evidence Verification Cache — Server-side TTL cache.
 *
 * Keyed by normalized URL. Default TTL of 6 hours.
 * In-memory Map — survives across requests within the same serverless instance
 * but resets on cold starts (acceptable for a verification cache).
 */

import type { VerificationResult, VerificationError } from "./evidence-verify";

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry {
  result: VerificationResult | VerificationError;
  expiresAt: number; // Unix timestamp ms
  cachedAt: string; // ISO 8601
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_SIZE = 2000; // Max entries before eviction
const EVICT_BATCH = 200; // Evict this many oldest entries when full

// ============================================================================
// CACHE STORE
// ============================================================================

const cache = new Map<string, CacheEntry>();

/** Normalize the cache key — lowercase, trimmed */
function cacheKey(normalizedUrl: string): string {
  return normalizedUrl.toLowerCase().trim();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a cached verification result.
 * Returns null if not cached or expired.
 */
export function getCachedVerification(
  normalizedUrl: string
): (VerificationResult | VerificationError) | null {
  const key = cacheKey(normalizedUrl);
  const entry = cache.get(key);

  if (!entry) return null;

  // Check TTL
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.result;
}

/**
 * Store a verification result in cache.
 * Automatically evicts old entries if cache is full.
 */
export function setCachedVerification(
  normalizedUrl: string,
  result: VerificationResult | VerificationError,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  // Evict if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    evictOldest(EVICT_BATCH);
  }

  const key = cacheKey(normalizedUrl);
  cache.set(key, {
    result,
    expiresAt: Date.now() + ttlMs,
    cachedAt: new Date().toISOString(),
  });
}

/**
 * Check if a URL has a valid (non-expired) cache entry.
 */
export function isCached(normalizedUrl: string): boolean {
  return getCachedVerification(normalizedUrl) !== null;
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(normalizedUrl: string): boolean {
  return cache.delete(cacheKey(normalizedUrl));
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache stats for monitoring.
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: string;
} {
  // Prune expired entries opportunistically
  let expired = 0;
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      expired++;
    }
  }

  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate: `${expired} expired entries pruned`,
  };
}

// ============================================================================
// EVICTION
// ============================================================================

/** Evict the N oldest entries (by expiresAt, soonest-expiring first) */
function evictOldest(count: number): void {
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .slice(0, count);

  for (const [key] of entries) {
    cache.delete(key);
  }
}
