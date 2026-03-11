const CLAIM_CACHE_TTL_MS = 15 * 60 * 1000;
const CLAIM_FETCH_TIMEOUT_MS = 3_500;
const MAX_HTML_BYTES = 140_000;

const CLAIM_CACHE = new Map<string, { claim: string; expiresAt: number }>();

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/i,
];

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^172\.(\d{1,3})\./);
  if (!m) return false;
  const second = Number(m[1]);
  return Number.isFinite(second) && second >= 16 && second <= 31;
}

function isLikelyPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.endsWith(".local")) return true;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (isPrivateIpv4(normalized)) return true;
  return false;
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClaimSentence(text: string): string {
  const value = cleanText(text)
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .replace(/\s+\|\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .trim();

  if (!value) return "";
  const first = value[0];
  const head = first && /[a-z]/.test(first) ? `${first.toUpperCase()}${value.slice(1)}` : value;
  return /[.!?]$/.test(head) ? head : `${head}.`;
}

function extractMetaContentByAttr(html: string, attr: "name" | "property", key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]*${attr}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = html.match(re);
  return match?.[1] ? cleanText(match[1]) : "";
}

function extractTitleTag(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? cleanText(match[1]) : "";
}

function extractClaimFromHtml(html: string): string {
  const candidates = [
    extractMetaContentByAttr(html, "property", "og:title"),
    extractMetaContentByAttr(html, "name", "twitter:title"),
    extractTitleTag(html),
    extractMetaContentByAttr(html, "name", "description"),
    extractMetaContentByAttr(html, "property", "og:description"),
  ]
    .map((candidate) => normalizeClaimSentence(candidate))
    .filter((candidate) => candidate.length >= 20);

  return candidates[0] || "";
}

function validatePublicHttpUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isLikelyPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function fetchCanonicalClaimFromSource(rawUrl: string): Promise<string | null> {
  const url = validatePublicHttpUrl(rawUrl);
  if (!url) return null;

  const cached = CLAIM_CACHE.get(url.toString());
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.claim;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAIM_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "PooterIndexer/1.0 (+https://pooter.world)",
      },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return null;
    }

    const raw = await res.text();
    const html = raw.length > MAX_HTML_BYTES ? raw.slice(0, MAX_HTML_BYTES) : raw;
    const claim = extractClaimFromHtml(html);
    if (!claim) return null;

    CLAIM_CACHE.set(url.toString(), {
      claim,
      expiresAt: now + CLAIM_CACHE_TTL_MS,
    });
    return claim;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

