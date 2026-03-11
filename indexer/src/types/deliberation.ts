export const DELIBERATION_SCHEMA_VERSION = "1.0.0";

export const CLAIM_SOURCE_KINDS = ["headline", "source_statement", "user_submitted", "derived"] as const;
export type ClaimSourceKind = (typeof CLAIM_SOURCE_KINDS)[number];

export const INTERPRETATION_KINDS = ["discussion", "claim", "counterclaim", "evidence", "source"] as const;
export type InterpretationKind = (typeof INTERPRETATION_KINDS)[number];

export const OUTCOME_STATES = ["unresolved", "resolved_true", "resolved_false", "contested"] as const;
export type OutcomeState = (typeof OUTCOME_STATES)[number];

export interface CanonicalClaim {
  id: string;
  entityHash: `0x${string}`;
  text: string;
  sourceKind: ClaimSourceKind;
  confidence: number;
  createdAt: string;
}

export interface CanonicalEvidence {
  id: string;
  entityHash: `0x${string}`;
  interpretationId?: string;
  url?: string;
  sourceLabel?: string;
  contentHash?: `0x${string}`;
  createdAt: string;
}

export interface CanonicalInterpretation {
  id: string;
  entityHash: `0x${string}`;
  parentId?: string;
  author: `0x${string}`;
  kind: InterpretationKind;
  text: string;
  evidenceIds: string[];
  createdAt: string;
}

export interface CanonicalOutcome {
  entityHash: `0x${string}`;
  claimId: string;
  state: OutcomeState;
  resolvedAt?: string;
  resolver?: string;
}

export interface CanonicalDeliberationGraph {
  schemaVersion: typeof DELIBERATION_SCHEMA_VERSION;
  entityHash: `0x${string}`;
  claim: CanonicalClaim;
  interpretations: CanonicalInterpretation[];
  evidence: CanonicalEvidence[];
  outcome: CanonicalOutcome;
  updatedAt: string;
}

interface FeedLikeItem {
  id: string;
  actor: `0x${string}`;
  actionType: number;
  data: string;
  timestamp: string;
}

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

function safeParseData(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeClaimSentence(text: string): string {
  let value = text
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .replace(/\s+\|\s+[A-Za-z][A-Za-z0-9 .&-]{2,}$/g, "")
    .trim();

  if (!value) return "";

  const first = value[0];
  if (first && /[a-z]/.test(first)) {
    value = `${first.toUpperCase()}${value.slice(1)}`;
  }

  if (!/[.!?]$/.test(value)) {
    value += ".";
  }

  return value;
}

function claimFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^\d+$/.test(s))
      .filter((s) => s.length > 2);

    const slug = segments[segments.length - 1] || "";
    if (!slug) {
      return normalizeClaimSentence(`Discussion around ${parsed.hostname}`);
    }

    const decoded = decodeURIComponent(slug)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const words = decoded
      .split(" ")
      .map((word) => word.toLowerCase())
      .filter((word) => word.length > 2 && !URL_WORD_STOPLIST.has(word));

    if (words.length === 0) {
      return normalizeClaimSentence(`Discussion around ${parsed.hostname}`);
    }

    return normalizeClaimSentence(words.join(" "));
  } catch {
    return "";
  }
}

function deriveClaim(identifier: string, entityHash: `0x${string}`, createdAt: string): CanonicalClaim {
  if (identifier.startsWith("url:")) {
    const rawUrl = identifier.slice(4).trim();
    const claimText = claimFromUrl(rawUrl) || normalizeClaimSentence(rawUrl);

    return {
      id: `${entityHash}:claim:canonical`,
      entityHash,
      text: claimText || "Claim unavailable.",
      sourceKind: "headline",
      confidence: claimText ? 0.72 : 0.25,
      createdAt,
    };
  }

  if (identifier.startsWith("proposal:")) {
    const proposalRef = identifier.slice("proposal:".length).trim();
    const claimText = normalizeClaimSentence(`Governance proposal ${proposalRef} is under deliberation`);
    return {
      id: `${entityHash}:claim:canonical`,
      entityHash,
      text: claimText || "Governance proposal is under deliberation.",
      sourceKind: "source_statement",
      confidence: 0.6,
      createdAt,
    };
  }

  const fallback = normalizeClaimSentence(identifier.replace(/^[^:]+:/, "").trim());
  return {
    id: `${entityHash}:claim:canonical`,
    entityHash,
    text: fallback || "Claim unavailable.",
    sourceKind: "derived",
    confidence: fallback ? 0.5 : 0.2,
    createdAt,
  };
}

function interpretationFromFeedItem(item: FeedLikeItem, entityHash: `0x${string}`): CanonicalInterpretation | null {
  const data = safeParseData(item.data);
  const score = typeof data.score === "number" ? data.score : Number(data.score ?? NaN);
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  const commentId = typeof data.commentId === "string" ? data.commentId : undefined;
  const parentId = typeof data.parentId === "string" && data.parentId !== "0" ? data.parentId : undefined;

  if (item.actionType === 3) {
    const text = reason.length > 0 ? reason : Number.isFinite(score) ? `Rated ${score}/5` : "Rated with reason";
    return {
      id: item.id,
      entityHash,
      parentId,
      author: item.actor,
      kind: reason.length > 0 ? "claim" : "discussion",
      text,
      evidenceIds: [],
      createdAt: item.timestamp,
    };
  }

  if (item.actionType === 1) {
    return {
      id: item.id,
      entityHash,
      parentId,
      author: item.actor,
      kind: "discussion",
      text: commentId ? `Onchain comment #${commentId}` : "Onchain comment",
      evidenceIds: [],
      createdAt: item.timestamp,
    };
  }

  return null;
}

function collectEvidence(
  entityHash: `0x${string}`,
  interpretations: CanonicalInterpretation[],
): CanonicalEvidence[] {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const evidence: CanonicalEvidence[] = [];

  for (const interpretation of interpretations) {
    const urls = interpretation.text.match(urlRegex) ?? [];
    urls.forEach((url, idx) => {
      const evidenceId = `${interpretation.id}:evidence:${idx + 1}`;
      interpretation.evidenceIds.push(evidenceId);
      evidence.push({
        id: evidenceId,
        entityHash,
        interpretationId: interpretation.id,
        url,
        sourceLabel: "linked_url",
        createdAt: interpretation.createdAt,
      });
    });
  }

  return evidence;
}

export function buildCanonicalDeliberationGraph(input: {
  entityHash: `0x${string}`;
  identifier: string;
  firstSeen: string;
  lastActivity: string;
  recentActivity: FeedLikeItem[];
  claimHint?: string | null;
}): CanonicalDeliberationGraph {
  const interpretations = input.recentActivity
    .map((item) => interpretationFromFeedItem(item, input.entityHash))
    .filter((item): item is CanonicalInterpretation => item !== null);

  const evidence = collectEvidence(input.entityHash, interpretations);
  const hint = normalizeClaimSentence(input.claimHint || "");
  const claim =
    hint.length >= 20
      ? {
          id: `${input.entityHash}:claim:canonical`,
          entityHash: input.entityHash,
          text: hint,
          sourceKind: "source_statement" as const,
          confidence: 0.86,
          createdAt: input.firstSeen,
        }
      : deriveClaim(input.identifier, input.entityHash, input.firstSeen);

  return {
    schemaVersion: DELIBERATION_SCHEMA_VERSION,
    entityHash: input.entityHash,
    claim,
    interpretations,
    evidence,
    outcome: {
      entityHash: input.entityHash,
      claimId: claim.id,
      state: "unresolved",
    },
    updatedAt: input.lastActivity,
  };
}
