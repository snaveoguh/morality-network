import "server-only";

import { reportWarn } from "./report-error";

// ============================================================================
// CLOUDFLARE BROWSER RENDERING — Rich content extraction
//
// Three modes:
//   1. /markdown  — Synchronous single-page → clean markdown (article scraping)
//   2. /content   — Synchronous single-page → rendered HTML
//   3. /crawl     — Async multi-page crawl → full site content
//
// Replaces our homegrown HTML scraper with Cloudflare's headless browser.
// Falls back gracefully to the old scraper when no CF credentials.
//
// Env vars:
//   CLOUDFLARE_API_TOKEN   — Bearer token with Browser Rendering permissions
//   CLOUDFLARE_ACCOUNT_ID  — Account ID
// ============================================================================

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

const MARKDOWN_TIMEOUT_MS = 12_000;
const CONTENT_TIMEOUT_MS = 12_000;
const MAX_MARKDOWN_CHARS = 8000; // generous — Claude can handle more context now

export function isCloudflareAvailable(): boolean {
  return Boolean(CF_API_TOKEN && CF_ACCOUNT_ID);
}

// ============================================================================
// /markdown — Single-page → clean Markdown
// Best for article scraping. Strips scripts, nav, styling. Returns prose.
// ============================================================================

export async function fetchMarkdown(
  url: string,
  options?: {
    /** Wait for JS-rendered content (slower but more complete) */
    waitForSelector?: string;
    /** Custom user agent */
    userAgent?: string;
  },
): Promise<string | null> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKDOWN_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = { url };

    if (options?.waitForSelector) {
      body.waitForSelector = options.waitForSelector;
    }
    if (options?.userAgent) {
      body.userAgent = options.userAgent;
    }

    // Skip images/fonts/media for faster extraction
    body.rejectResourceTypes = ["image", "font", "media", "stylesheet"];

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/markdown`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      console.warn(`[cf-crawl] /markdown failed for ${url}: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as { success: boolean; result?: string };
    if (!data.success || !data.result) return null;

    const markdown = data.result.trim();
    if (markdown.length < 50) return null; // too short to be useful

    return markdown.slice(0, MAX_MARKDOWN_CHARS);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn(`[cf-crawl] /markdown timeout for ${url}`);
    } else {
      console.warn(`[cf-crawl] /markdown error for ${url}:`, (err as Error).message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// /content — Single-page → rendered HTML
// Use when you need the full DOM (e.g., extracting structured data, JSON-LD)
// ============================================================================

export async function fetchRenderedHTML(
  url: string,
  options?: {
    waitForSelector?: string;
    userAgent?: string;
  },
): Promise<string | null> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = { url };

    if (options?.waitForSelector) body.waitForSelector = options.waitForSelector;
    if (options?.userAgent) body.userAgent = options.userAgent;

    body.rejectResourceTypes = ["image", "font", "media"];

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!res.ok) return null;

    const html = await res.text();
    return html || null;
  } catch (e) {
    reportWarn("cloudflare-crawl:fetch", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// /crawl — Async multi-page crawl
// Returns a job ID. Poll for results.
// Use for deep site crawls (funding pages, ownership discovery).
// ============================================================================

export interface CrawlJobResult {
  jobId: string;
}

export interface CrawlRecord {
  url: string;
  status: "completed" | "queued" | "errored" | "skipped" | "disallowed" | "cancelled";
  markdown?: string;
  html?: string;
  metadata?: {
    status: number;
    title: string;
    url: string;
  };
}

export interface CrawlResults {
  id: string;
  status: "running" | "completed" | "errored" | "cancelled_due_to_timeout" | "cancelled_due_to_limits" | "cancelled_by_user";
  total: number;
  finished: number;
  records: CrawlRecord[];
  cursor?: number;
}

/**
 * Start an async crawl job. Returns a job ID to poll for results.
 */
export async function startCrawl(
  url: string,
  options?: {
    limit?: number;     // max pages (default 10)
    depth?: number;     // max depth (default 1)
    formats?: ("markdown" | "html" | "json")[];
    includePatterns?: string[];
    excludePatterns?: string[];
    render?: boolean;   // default true
  },
): Promise<CrawlJobResult | null> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return null;

  try {
    const body: Record<string, unknown> = {
      url,
      limit: options?.limit ?? 10,
      depth: options?.depth ?? 1,
      formats: options?.formats ?? ["markdown"],
      render: options?.render ?? false, // fast mode for text content
    };

    if (options?.includePatterns || options?.excludePatterns) {
      body.options = {
        includePatterns: options?.includePatterns,
        excludePatterns: options?.excludePatterns,
      };
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      console.warn(`[cf-crawl] /crawl start failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { success: boolean; result?: string };
    if (!data.success || !data.result) return null;

    return { jobId: data.result };
  } catch (err) {
    console.warn("[cf-crawl] /crawl start error:", (err as Error).message);
    return null;
  }
}

/**
 * Fetch crawl job results. Returns null if job not ready or failed.
 */
export async function getCrawlResults(
  jobId: string,
  options?: { limit?: number; cursor?: number },
): Promise<CrawlResults | null> {
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return null;

  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", String(options.cursor));
    params.set("status", "completed");

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl/${jobId}?${params}`,
      {
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
        },
      },
    );

    if (!res.ok) return null;

    const data = await res.json() as { success: boolean; result?: CrawlResults };
    if (!data.success || !data.result) return null;

    return data.result;
  } catch (e) {
    reportWarn("cloudflare-crawl:fetch", e);
    return null;
  }
}

/**
 * Convenience: start a crawl and poll until complete (with timeout).
 * For small crawls (1-5 pages). Returns all records.
 */
export async function crawlAndWait(
  url: string,
  options?: {
    limit?: number;
    depth?: number;
    formats?: ("markdown" | "html" | "json")[];
    includePatterns?: string[];
    excludePatterns?: string[];
    pollIntervalMs?: number;
    maxWaitMs?: number;
    render?: boolean;
  },
): Promise<CrawlRecord[]> {
  const job = await startCrawl(url, options);
  if (!job) return [];

  const pollInterval = options?.pollIntervalMs ?? 2000;
  const maxWait = options?.maxWaitMs ?? 30_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const results = await getCrawlResults(job.jobId);
    if (!results) continue;

    if (results.status === "completed" || results.status === "errored") {
      return results.records;
    }
    if (results.status.startsWith("cancelled")) {
      return results.records;
    }
  }

  console.warn(`[cf-crawl] crawlAndWait timeout for ${url}`);
  // Try to get whatever we have
  const partial = await getCrawlResults(job.jobId);
  return partial?.records ?? [];
}
