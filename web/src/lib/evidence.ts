import { keccak256, toBytes } from "viem";

export type EvidenceSourceType =
  | "government-record"
  | "dao-governance"
  | "research"
  | "news-report"
  | "social-post"
  | "primary-source"
  | "unknown";

export type EvidenceQualityTier = "high" | "medium" | "low";

export interface ParsedEvidence {
  input: string;
  isValidUrl: boolean;
  normalized: string;
  evidenceHash: `0x${string}`;
  host: string;
  sourceType: EvidenceSourceType;
  qualityTier: EvidenceQualityTier;
  warnings: string[];
}

const TRACKING_PARAM_RE = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$)/i;

const DAO_HOST_HINTS = [
  "snapshot.org",
  "tally.xyz",
  "basescan.org",
  "etherscan.io",
  "nouns.wtf",
  "compound.finance",
  "arbiscan.io",
  "optimistic.etherscan.io",
];

const GOV_HOST_HINTS = [
  ".gov",
  ".gouv",
  "parliament",
  "congress.gov",
  "europa.eu",
  "sec.gov",
  "legislation.gov",
  "house.gov",
  "senate.gov",
];

const RESEARCH_HOST_HINTS = [
  "arxiv.org",
  "doi.org",
  "nature.com",
  "science.org",
  "cell.com",
  "pubmed.ncbi.nlm.nih.gov",
  "ssrn.com",
];

const SOCIAL_HOST_HINTS = [
  "x.com",
  "twitter.com",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "telegram.me",
  "discord.com",
  "discord.gg",
];

const NEWS_HOST_HINTS = [
  "reuters.com",
  "apnews.com",
  "bbc.",
  "ft.com",
  "wsj.com",
  "bloomberg.com",
  "theguardian.com",
  "nytimes.com",
  "aljazeera.com",
  "dw.com",
  "scmp.com",
  "politico.com",
  "thehill.com",
  "cnn.com",
  "foxnews.com",
  "news.",
];

function normalizeUrl(url: URL): string {
  const normalized = new URL(url.toString());
  normalized.hash = "";

  const cleanParams = new URLSearchParams();
  for (const [key, value] of normalized.searchParams.entries()) {
    if (!TRACKING_PARAM_RE.test(key)) {
      cleanParams.set(key, value);
    }
  }
  normalized.search = cleanParams.toString() ? `?${cleanParams.toString()}` : "";

  if (normalized.pathname.endsWith("/")) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }

  return normalized.toString();
}

function includesAny(host: string, hints: string[]): boolean {
  const lc = host.toLowerCase();
  return hints.some((hint) => lc.includes(hint));
}

function classifySourceType(host: string): EvidenceSourceType {
  if (includesAny(host, GOV_HOST_HINTS)) return "government-record";
  if (includesAny(host, DAO_HOST_HINTS)) return "dao-governance";
  if (includesAny(host, RESEARCH_HOST_HINTS)) return "research";
  if (includesAny(host, SOCIAL_HOST_HINTS)) return "social-post";
  if (includesAny(host, NEWS_HOST_HINTS)) return "news-report";

  if (host.endsWith(".org") || host.endsWith(".edu")) return "primary-source";
  return "unknown";
}

function qualityForType(type: EvidenceSourceType): EvidenceQualityTier {
  switch (type) {
    case "government-record":
    case "dao-governance":
    case "research":
      return "high";
    case "news-report":
    case "primary-source":
      return "medium";
    case "social-post":
    case "unknown":
    default:
      return "low";
  }
}

function warningsForType(type: EvidenceSourceType): string[] {
  if (type === "social-post") {
    return ["Social posts are weak evidence without corroborating sources."];
  }
  if (type === "unknown") {
    return ["Unclassified domain. Consider adding a primary or official source."];
  }
  return [];
}

export function parseEvidenceInput(input: string): ParsedEvidence {
  const raw = input.trim();

  if (!raw) {
    return {
      input,
      isValidUrl: false,
      normalized: "",
      evidenceHash: keccak256(toBytes("")),
      host: "",
      sourceType: "unknown",
      qualityTier: "low",
      warnings: ["Evidence URL is required."],
    };
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only HTTP/HTTPS links are supported.");
    }

    const normalized = normalizeUrl(url);
    const host = url.hostname.toLowerCase();
    const sourceType = classifySourceType(host);
    const qualityTier = qualityForType(sourceType);

    return {
      input,
      isValidUrl: true,
      normalized,
      evidenceHash: keccak256(toBytes(normalized)),
      host,
      sourceType,
      qualityTier,
      warnings: warningsForType(sourceType),
    };
  } catch {
    const normalized = raw;
    return {
      input,
      isValidUrl: false,
      normalized,
      evidenceHash: keccak256(toBytes(normalized)),
      host: "",
      sourceType: "unknown",
      qualityTier: "low",
      warnings: ["Invalid URL. Paste a full https:// link."],
    };
  }
}
