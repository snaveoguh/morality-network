// Polite, auditable HTTP for MP Record ingesters (MP_RECORD_SPEC §3).
// One request at a time per host, minimum spacing, retry with backoff on
// 429/5xx/network errors, hard timeout, and every final response body handed
// to the store BEFORE anything parses it.

import { sha256Hex } from "./hash";
import type { MpSource } from "./types";

export const MP_INGEST_USER_AGENT =
  "pooter.world MP Record ingester (+https://pooter.world/mp)";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface RawFetchInput {
  source: MpSource;
  url: string;
  httpStatus: number;
  contentType: string | null;
  body: string;
  bodySha256: string;
  fetchedAt: string;
}

export interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string;
  rawFetchId: number | null;
  fetchedAt: string;
}

export interface Fetcher {
  get(url: string, source: MpSource): Promise<FetchResult>;
}

export interface FetcherOptions {
  recordRaw?: (raw: RawFetchInput) => Promise<number | null>;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  userAgent?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createFetcher(opts: FetcherOptions = {}): Fetcher {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const minInterval =
    opts.minIntervalMs ?? Number(process.env.MP_INGEST_MIN_INTERVAL_MS ?? 500);
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const lastByHost = new Map<string, number>();
  // Serialise per host so concurrent callers still respect the spacing.
  const queueByHost = new Map<string, Promise<unknown>>();

  async function throttle(host: string): Promise<void> {
    const last = lastByHost.get(host);
    if (last !== undefined) {
      const wait = last + minInterval - now();
      if (wait > 0) await sleep(wait);
    }
    lastByHost.set(host, now());
  }

  async function attemptAll(url: string, source: MpSource): Promise<FetchResult> {
    const host = new URL(url).host;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await throttle(host);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          headers: { Accept: "application/json, text/csv;q=0.9, */*;q=0.1", "User-Agent": opts.userAgent ?? MP_INGEST_USER_AGENT },
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await res.text();
        if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 1000 * 2 ** attempt);
          continue;
        }
        const fetchedAt = new Date(now()).toISOString();
        const contentType = res.headers.get("content-type");
        const rawFetchId = opts.recordRaw
          ? await opts.recordRaw({
              source,
              url,
              httpStatus: res.status,
              contentType,
              body,
              bodySha256: sha256Hex(body),
              fetchedAt,
            })
          : null;
        return { url, status: res.status, ok: res.ok, contentType, body, rawFetchId, fetchedAt };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) await sleep(1000 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`fetch failed after ${maxAttempts} attempts: ${url}: ${String(lastError)}`);
  }

  return {
    get(url, source) {
      const host = new URL(url).host;
      const prev = queueByHost.get(host) ?? Promise.resolve();
      const next = prev.catch(() => undefined).then(() => attemptAll(url, source));
      queueByHost.set(host, next);
      return next;
    },
  };
}

/** Throw unless the response is a 2xx; returns the parsed JSON. */
export function okJson(res: FetchResult): unknown {
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${res.url}`);
  try {
    return JSON.parse(res.body);
  } catch {
    throw new Error(`invalid JSON from ${res.url}`);
  }
}
