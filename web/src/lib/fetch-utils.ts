/**
 * Shared fetch utilities — retry logic, timeout, retryable status codes.
 * Extracted from governance.ts, parliament.ts, rss.ts to eliminate 3x duplication.
 */

export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_MS = [500, 1000, 2000];

export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { next?: { revalidate: number } },
  maxRetries: number = DEFAULT_MAX_RETRIES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok || !RETRYABLE_STATUS_CODES.has(res.status)) {
        return res;
      }

      if (attempt < maxRetries) {
        const delay = BACKOFF_MS[attempt] ?? 2000;
        console.warn(`[fetchWithRetry] ${url} → ${res.status}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        return res;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (attempt < maxRetries) {
        const delay = BACKOFF_MS[attempt] ?? 2000;
        const reason =
          error instanceof DOMException && error.name === "AbortError"
            ? "timeout"
            : error instanceof Error
              ? error.message
              : String(error);
        console.warn(`[fetchWithRetry] ${url} failed (${reason}), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`[fetchWithRetry] unreachable — ${url}`);
}

/**
 * Wrap an async fetcher in try/catch that returns a fallback on error.
 * Eliminates the repeated `try { ... } catch { console.error(...); return []; }` pattern.
 */
export async function safeFetch<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[${name}] failed:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
