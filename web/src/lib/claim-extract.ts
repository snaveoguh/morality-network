interface ClaimExtractionInput {
  title?: string;
  description?: string;
  contextSummary?: string;
  seedClaim?: string;
  url?: string;
}

const NOISE_PREFIXES = [
  /^live\s*:\s*/i,
  /^breaking\s*:\s*/i,
  /^analysis\s*:\s*/i,
  /^opinion\s*:\s*/i,
  /^watch\s*:\s*/i,
  /^listen\s*:\s*/i,
  /^read\s*:\s*/i,
];

const WEAK_CLAIM_PATTERN =
  /^(live update|latest update|opinion|analysis|watch|listen|read|newsletter|podcast)\b/i;

const URL_WORD_STOPLIST = new Set([
  "amp",
  "article",
  "articles",
  "news",
  "story",
  "stories",
  "live",
  "updates",
  "update",
  "rss",
  "feed",
  "index",
  "html",
  "www",
  "com",
]);

function cleanSnippet(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function stripSourceSuffix(text: string): string {
  return text
    .replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .replace(/\s+\|\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .trim();
}

function removeNoisePrefix(text: string): string {
  let value = text;
  for (const pattern of NOISE_PREFIXES) {
    value = value.replace(pattern, "");
  }
  return value.trim();
}

function normalizeClaimSentence(text: string): string {
  let value = cleanSnippet(text);
  value = value.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  value = stripSourceSuffix(value);
  value = removeNoisePrefix(value);
  value = value.replace(/\s+/g, " ").trim();

  if (!value) return "";

  const firstChar = value[0];
  if (firstChar && /[a-z]/.test(firstChar)) {
    value = `${firstChar.toUpperCase()}${value.slice(1)}`;
  }

  if (!/[.!?]$/.test(value)) {
    value += ".";
  }

  return value;
}

function firstSentence(text: string): string {
  const cleaned = cleanSnippet(text);
  if (!cleaned) return "";
  const match = cleaned.match(/(.+?[.!?])(\s|$)/);
  return match ? match[1].trim() : cleaned.slice(0, 220).trim();
}

function isWeakClaim(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 18) return true;
  if (WEAK_CLAIM_PATTERN.test(trimmed)) return true;
  return false;
}

function claimFromUrl(url: string | undefined): string {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^\d+$/.test(s))
      .filter((s) => s.length > 2);

    const rawSlug = segments[segments.length - 1] || "";
    if (!rawSlug) return "";

    const decoded = decodeURIComponent(rawSlug)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = decoded
      .split(" ")
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2 && !URL_WORD_STOPLIST.has(w));

    if (words.length === 0) return "";
    return normalizeClaimSentence(words.join(" "));
  } catch {
    return "";
  }
}

export function extractCanonicalClaim(input: ClaimExtractionInput): string {
  const seed = normalizeClaimSentence(input.seedClaim || "");
  if (!isWeakClaim(seed)) return seed;

  const titleClaim = normalizeClaimSentence(input.title || "");
  const descClaim = normalizeClaimSentence(firstSentence(input.description || ""));
  const summaryClaim = normalizeClaimSentence(firstSentence(input.contextSummary || ""));
  const urlClaim = claimFromUrl(input.url);

  const candidates = [titleClaim, descClaim, summaryClaim, urlClaim].filter(Boolean);
  const strongest = candidates.find((candidate) => !isWeakClaim(candidate));

  if (strongest) return strongest;
  if (candidates.length > 0) return candidates[0]!;
  return "Claim unavailable.";
}

