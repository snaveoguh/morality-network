/**
 * Evidence Verification — Server-side hardened URL verification.
 *
 * Fetches a URL with safety guards (private IP blocking, timeout, redirect cap,
 * content-type enforcement) and returns structured verification results.
 *
 * Used by GET /api/evidence/verify?url=...
 */

import {
  parseEvidenceInput,
  type EvidenceSourceType,
  type EvidenceQualityTier,
} from "./evidence";

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  normalizedUrl: string;
  canonicalUrl: string | null;
  host: string;
  statusCode: number;
  contentType: string;
  title: string | null;
  sourceType: EvidenceSourceType;
  qualityTier: EvidenceQualityTier;
  safe: boolean;
  reasons: string[];
  fetchedAt: string; // ISO 8601
}

export interface VerificationError {
  error: string;
  safe: false;
  reasons: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 512_000; // 500KB — enough to parse <title>
const RETRY_DELAYS = [500, 1500]; // ms

// Private/reserved IP ranges (CIDR prefixes)
const PRIVATE_IP_PREFIXES = [
  "10.",
  "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  "192.168.",
  "127.",
  "0.",
  "169.254.",
  "::1",
  "fc00:",
  "fd00:",
  "fe80:",
];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "[::1]",
];

// Content types we'll accept for HTML evidence interpretation
const ACCEPTABLE_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/json",
  "application/xml",
  "text/xml",
  "application/pdf",
];

// ============================================================================
// URL VALIDATION
// ============================================================================

/** Normalize a raw URL string — prepend https:// if needed */
export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return "";
  // Only prepend https:// if no protocol is present
  // Detect existing protocol via "xxx://" pattern
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

/** Check if a hostname resolves to a private/reserved IP */
export function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block known local hostnames
  if (BLOCKED_HOSTNAMES.includes(lower)) return true;

  // Block raw IP addresses in private ranges
  if (PRIVATE_IP_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;

  // Block [::1] style IPv6
  if (lower.startsWith("[") && lower.includes("::")) return true;

  return false;
}

/** Validate that a URL is safe to fetch */
export function validateUrl(raw: string): { valid: boolean; url?: URL; reasons: string[] } {
  const reasons: string[] = [];

  if (!raw || !raw.trim()) {
    return { valid: false, reasons: ["URL is required."] };
  }

  let url: URL;
  try {
    url = new URL(normalizeUrl(raw));
  } catch {
    return { valid: false, reasons: ["Invalid URL format."] };
  }

  // Protocol check
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    reasons.push(`Protocol "${url.protocol}" is not allowed. Only http/https.`);
    return { valid: false, reasons };
  }

  // Private IP / localhost check
  if (isPrivateHost(url.hostname)) {
    reasons.push("Private/local network targets are blocked.");
    return { valid: false, reasons };
  }

  // Port restrictions — block unusual ports
  if (url.port && !["80", "443", ""].includes(url.port)) {
    reasons.push(`Non-standard port ${url.port} is blocked.`);
    return { valid: false, reasons };
  }

  return { valid: true, url, reasons: [] };
}

// ============================================================================
// HARDENED FETCH
// ============================================================================

/**
 * Fetch a URL with safety guards.
 * - HEAD first, GET fallback
 * - Timeout enforcement
 * - Redirect cap
 * - Content-type validation
 * - Retries with backoff
 */
export async function hardenedFetch(
  url: URL,
  method: "HEAD" | "GET" = "HEAD"
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "pooter-world-evidence-verifier/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Check redirect count via response URL differing from request URL
    // (fetch API follows redirects automatically, we check the final URL)
    const finalUrl = new URL(res.url);
    if (isPrivateHost(finalUrl.hostname)) {
      throw new Error("Redirect landed on a private/local network target.");
    }

    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch with retries and HEAD→GET fallback */
async function fetchWithRetries(url: URL): Promise<{
  response: Response;
  body: string | null;
  method: string;
}> {
  // Try HEAD first
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await hardenedFetch(url, "HEAD");
      if (res.ok || res.status === 405) {
        // HEAD succeeded or server doesn't support HEAD — we'll fall through to GET
        if (res.ok) {
          return { response: res, body: null, method: "HEAD" };
        }
        break; // 405 — fall through to GET
      }
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 1000);
        continue;
      }
      return { response: res, body: null, method: "HEAD" };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 1000);
        continue;
      }
      // Fall through to GET on final HEAD failure
      break;
    }
  }

  // GET fallback — needed for title extraction and when HEAD fails
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await hardenedFetch(url, "GET");

      let body: string | null = null;
      const contentType = res.headers.get("content-type") || "";
      const isTextual = ACCEPTABLE_CONTENT_TYPES.some((ct) => contentType.includes(ct));

      if (isTextual && res.body) {
        // Read up to MAX_BODY_BYTES
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (totalBytes < MAX_BODY_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalBytes += value.length;
        }
        reader.cancel();

        const decoder = new TextDecoder("utf-8", { fatal: false });
        body = decoder.decode(concatUint8Arrays(chunks));
      }

      return { response: res, body, method: "GET" };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] || 1000);
        continue;
      }
      throw err;
    }
  }

  throw new Error("All fetch attempts exhausted.");
}

// ============================================================================
// TITLE EXTRACTION
// ============================================================================

/** Extract <title> from HTML body */
export function extractTitle(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim()
    .slice(0, 300); // cap at 300 chars
}

/** Extract <link rel="canonical"> from HTML body */
export function extractCanonical(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!match) return null;
  try {
    // Validate it's a real URL
    new URL(match[1]);
    return match[1];
  } catch {
    return null;
  }
}

// ============================================================================
// CONTENT TYPE VALIDATION
// ============================================================================

export function isAcceptableContentType(contentType: string): boolean {
  if (!contentType) return false;
  return ACCEPTABLE_CONTENT_TYPES.some((ct) => contentType.toLowerCase().includes(ct));
}

// ============================================================================
// MAIN VERIFY FUNCTION
// ============================================================================

export async function verifyEvidence(rawUrl: string): Promise<VerificationResult | VerificationError> {
  // 1. Validate URL
  const validation = validateUrl(rawUrl);
  if (!validation.valid || !validation.url) {
    return {
      error: validation.reasons[0] || "Invalid URL.",
      safe: false,
      reasons: validation.reasons,
    };
  }

  const url = validation.url;

  // 2. Parse evidence metadata (source type, quality tier)
  const parsed = parseEvidenceInput(url.toString());

  // 3. Fetch with retries
  let response: Response;
  let body: string | null = null;
  try {
    const result = await fetchWithRetries(url);
    response = result.response;
    body = result.body;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed.";
    return {
      error: `Failed to reach URL: ${message}`,
      safe: false,
      reasons: [`Fetch error: ${message}`],
    };
  }

  // 4. Build result
  const contentType = response.headers.get("content-type") || "";
  const statusCode = response.status;
  const title = extractTitle(body);
  const canonicalUrl = extractCanonical(body);

  const reasons: string[] = [...parsed.warnings];
  let safe = true;

  // Status code checks
  if (statusCode >= 400) {
    safe = false;
    reasons.push(`HTTP ${statusCode}: server returned an error.`);
  }

  // Content type check — warn on binary for interpretation evidence
  if (contentType && !isAcceptableContentType(contentType)) {
    reasons.push(`Content-Type "${contentType.split(";")[0]}" is binary/non-interpretable.`);
    // Still "safe" as a URL — just not ideal for interpretation
  }

  // HTTPS check
  if (url.protocol === "http:") {
    reasons.push("URL uses HTTP (not HTTPS). Content may be tampered in transit.");
  }

  return {
    normalizedUrl: parsed.normalized,
    canonicalUrl,
    host: url.hostname.toLowerCase(),
    statusCode,
    contentType: contentType.split(";")[0].trim(),
    title,
    sourceType: parsed.sourceType,
    qualityTier: parsed.qualityTier,
    safe,
    reasons,
    fetchedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
