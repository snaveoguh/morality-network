import "server-only";

import { NextResponse } from "next/server";

/**
 * Simple in-memory rate limiter for API endpoints.
 *
 * Uses a sliding window counter per IP address. Limits are enforced per-instance
 * (not shared across Vercel serverless instances), so effective limits are
 * slightly higher than configured — but still blocks aggressive abuse.
 *
 * Usage:
 *   import { rateLimit, getRateLimitResponse } from "@/lib/rate-limit";
 *
 *   export async function GET(request: Request) {
 *     const limited = rateLimit(request, { maxRequests: 10, windowMs: 60_000 });
 *     if (limited) return limited;
 *     // ... handler
 *   }
 */

interface RateLimitConfig {
  /** Max requests per window (default: 30) */
  maxRequests?: number;
  /** Window duration in ms (default: 60_000 = 1 minute) */
  windowMs?: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// Per-endpoint rate limit stores (keyed by endpoint path)
const stores = new Map<string, Map<string, WindowEntry>>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 300_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }
}

function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for; fall back to x-real-ip
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Check rate limit for an incoming request.
 * Returns a 429 NextResponse if rate limited, or null if OK.
 */
export function rateLimit(
  request: Request,
  config: RateLimitConfig = {},
): NextResponse | null {
  const { maxRequests = 30, windowMs = 60_000 } = config;

  // Skip rate limiting in development
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const url = new URL(request.url);
  const endpoint = url.pathname;
  const ip = getClientIp(request);
  const key = `${ip}:${endpoint}`;

  cleanup();

  // Get or create store for this endpoint
  if (!stores.has(endpoint)) {
    stores.set(endpoint, new Map());
  }
  const store = stores.get(endpoint)!;

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      },
    );
  }

  return null;
}
