// Claim Ledger — claim-extraction agent.
// Pulls CHECKABLE claims out of Hansard contributions: verbatim quote +
// neutral normalized restatement + checkability class. Extraction pattern
// follows lib/narrative-extractor.ts (JSON-array prompt, hard validation).
//
// Integrity guards (spec Principles, non-negotiable):
//   - a verbatim quote MUST be an exact substring of the source contribution;
//     anything else is dropped, never repaired. No hallucinated quotes.
//   - normalized claims are screened for motive vocabulary ("lie" etc.) and
//     dropped if any appears. The ledger never infers motive.

import { createHash } from "node:crypto";
import type {
  HansardContribution,
  HansardDebate,
  LedgerClaim,
  LedgerClaimTopic,
  LedgerClaimType,
  LedgerContext,
  LedgerExtractorStamp,
} from "./types";

/** Bump when the prompt or validation pipeline changes materially. */
export const EXTRACTOR_VERSION = "pmqs-extract-v1";

const VALID_TYPES = new Set<LedgerClaimType>([
  "retrodictable",
  "predictive",
  "unfalsifiable",
]);

const VALID_TOPICS = new Set<LedgerClaimTopic>([
  "statistics",
  "voting-record",
  "policy-outcome",
  "spending",
  "other",
]);

// Motive/deception vocabulary that must never appear in ledger output.
// Word-boundary match, case-insensitive. "lie/lying/liar" variants are the
// spec's named exclusion; the rest are the same inference by synonym.
const FORBIDDEN_VOCAB =
  /\b(lie|lies|lied|lying|liar|liars|deceit(ful)?|deceiv\w*|dishonest\w*|untruthful\w*|misl(ed|eads?|eading) (the house|parliament|voters|the public) (deliberately|knowingly|intentionally)|deliberately misl\w*|knowingly misl\w*|intentionally misl\w*)\b/i;

export interface RawExtractedClaim {
  contribution_id: string;
  verbatim_quote: string;
  normalized_claim: string;
  claim_type: string;
  topic?: string;
  resolution_due?: string | null;
}

/** Minimal generation interface so tests/benchmarks can inject a model. */
export type LedgerGenerate = (req: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}) => Promise<{ text: string; provider: string; model: string }>;

// Lazy import keeps this module loadable in tests without the full provider
// stack; the provider chain only loads when extraction actually runs.
const defaultGenerate: LedgerGenerate = async (req) => {
  const { generateTextForTask } = await import("../ai-provider");
  const result = await generateTextForTask({
    task: "claimLedgerExtraction",
    ...req,
  });
  return { text: result.text, provider: result.provider, model: result.model };
};

const CONTEXT_LABEL: Record<string, string> = {
  pmqs: "Prime Minister's Questions",
  budget: "a Budget speech (Financial Statement)",
};

const SYSTEM_PROMPT = `You extract CHECKABLE claims from UK parliamentary speech.

A checkable claim is a factual assertion that could in principle be verified against records: statistics ("inflation is at 2 per cent"), voting records ("he voted against the bill"), policy outcomes ("we have recruited 10,000 more police officers"), spending ("we invested £5 billion in the NHS"), or dated predictions ("waiting lists will fall by next year").

NOT claims: opinions, values, insults, rhetorical questions, statements of intent without a measurable commitment, and pleasantries.

Output ONLY a JSON array. Each element:
{
  "contribution_id": "<the id shown in [brackets] before the contribution>",
  "verbatim_quote": "<EXACT substring copied character-for-character from that contribution — never paraphrase, never fix grammar, never merge sentences that are not adjacent>",
  "normalized_claim": "<one neutral sentence restating the checkable proposition. No adjectives, no motive words, no judgement — state only what is asserted>",
  "claim_type": "retrodictable" | "predictive" | "unfalsifiable",
  "topic": "statistics" | "voting-record" | "policy-outcome" | "spending" | "other",
  "resolution_due": "<YYYY-MM-DD if the claim itself states or implies a deadline, else null>"
}

claim_type rules:
- "retrodictable": checkable against existing records right now.
- "predictive": asserts something about the future; set resolution_due when a timeframe is stated.
- "unfalsifiable": sounds factual but no record could settle it. Extract these too — they are labelled and excluded from scoring.

Return [] if a contribution contains no checkable claims. Quality over quantity: most contributions contain only a handful of real claims.`;

/**
 * Whitespace-insensitive exact-substring check. Returns the matched substring
 * as it appears in `text` (so stored quotes always reproduce the source), or
 * null if the quote is not verbatim.
 */
export function findVerbatimQuote(text: string, quote: string): string | null {
  const trimmed = quote.trim();
  if (trimmed.length < 8) return null;

  const direct = text.indexOf(trimmed);
  if (direct >= 0) return trimmed;

  // Tolerate whitespace-run and quote-mark differences only. Build a regex
  // where each whitespace run matches any whitespace and quote marks match
  // either form; everything else must match exactly.
  const pattern = trimmed
    .split(/\s+/)
    .map((word) =>
      word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['‘’]/g, "['‘’]").replace(/["“”]/g, '["“”]'),
    )
    .join("\\s+");
  try {
    const match = text.match(new RegExp(pattern));
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/** True if the normalized claim uses vocabulary the ledger forbids. */
export function violatesLedgerVocabulary(normalizedClaim: string): boolean {
  return FORBIDDEN_VOCAB.test(normalizedClaim);
}

/** Parse the model's JSON-array response; malformed elements are dropped. */
export function parseExtractionResponse(text: string): RawExtractedClaim[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const raw = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (c): c is RawExtractedClaim =>
        c &&
        typeof c.contribution_id === "string" &&
        typeof c.verbatim_quote === "string" &&
        typeof c.normalized_claim === "string" &&
        typeof c.claim_type === "string",
    );
  } catch {
    return [];
  }
}

export function claimId(contributionExternalId: string, verbatimQuote: string): string {
  return createHash("sha256")
    .update(`${contributionExternalId}\n${verbatimQuote}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Validate one raw model output against its source contribution.
 * Returns a LedgerClaim or null (dropped). Dropping is always safe; the
 * golden-set benchmark measures what validation costs in recall.
 */
export function validateRawClaim(
  raw: RawExtractedClaim,
  contribution: HansardContribution,
  debate: Pick<HansardDebate, "date">,
  stamp: LedgerExtractorStamp,
  context: LedgerContext = "pmqs",
): LedgerClaim | null {
  if (!VALID_TYPES.has(raw.claim_type as LedgerClaimType)) return null;

  const verbatim = findVerbatimQuote(contribution.text, raw.verbatim_quote);
  if (!verbatim) return null;

  const normalized = raw.normalized_claim.trim();
  if (normalized.length < 12 || normalized.length > 400) return null;
  if (violatesLedgerVocabulary(normalized)) return null;

  const topic = VALID_TOPICS.has(raw.topic as LedgerClaimTopic)
    ? (raw.topic as LedgerClaimTopic)
    : "other";

  let resolutionDue: string | null = null;
  if (
    raw.claim_type === "predictive" &&
    typeof raw.resolution_due === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.resolution_due)
  ) {
    resolutionDue = raw.resolution_due;
  }

  return {
    id: claimId(contribution.externalId, verbatim),
    speaker: contribution.speaker,
    verbatimQuote: verbatim,
    normalizedClaim: normalized,
    claimType: raw.claim_type as LedgerClaimType,
    topic,
    resolutionDue,
    sourceUrl: contribution.sourceUrl,
    contributionExternalId: contribution.externalId,
    utteredAt: debate.date,
    context,
    extractedBy: stamp,
    occurrences: 1,
  };
}

/** Same normalized proposition repeated across turns collapses to one claim. */
export function dedupeClaims(claims: LedgerClaim[]): LedgerClaim[] {
  const byKey = new Map<string, LedgerClaim>();
  for (const claim of claims) {
    const key = `${claim.speaker.memberId ?? claim.speaker.name}|${claim.normalizedClaim.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
    } else {
      byKey.set(key, { ...claim });
    }
  }
  return [...byKey.values()];
}

/**
 * Split one oversized contribution (e.g. a 50k-char Budget speech) into
 * windows at sentence boundaries. Windows share the original externalId, so
 * claims still cite the real contribution and verbatim validation runs
 * against the FULL original text.
 */
export function splitOversizedContribution(
  contribution: HansardContribution,
  maxChars: number,
): HansardContribution[] {
  if (contribution.text.length <= maxChars) return [contribution];
  const sentences = contribution.text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [
    contribution.text,
  ];
  const pieces: HansardContribution[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer.length > 0 && buffer.length + sentence.length > maxChars) {
      pieces.push({ ...contribution, text: buffer.trim() });
      buffer = "";
    }
    buffer += sentence;
  }
  if (buffer.trim().length > 0) pieces.push({ ...contribution, text: buffer.trim() });
  return pieces;
}

/** Group contributions into prompt chunks bounded by character budget. */
export function chunkContributions(
  contributions: HansardContribution[],
  maxChars: number = 7000,
): HansardContribution[][] {
  const pieces = contributions.flatMap((c) =>
    splitOversizedContribution(c, maxChars),
  );
  const chunks: HansardContribution[][] = [];
  let current: HansardContribution[] = [];
  let size = 0;
  for (const c of pieces) {
    if (current.length > 0 && size + c.text.length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(c);
    size += c.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function buildChunkPrompt(
  chunk: HansardContribution[],
  context: LedgerContext,
): string {
  const blocks = chunk.map(
    (c) =>
      `[${c.externalId}] ${c.speaker.name}${c.speaker.party ? ` (${c.speaker.party})` : ""}:\n${c.text}`,
  );
  return `Extract checkable claims from these contributions at ${CONTEXT_LABEL[context] ?? context}:\n\n${blocks.join("\n\n")}`;
}

/**
 * Run extraction over a full debate. One model call per chunk, sequential —
 * PMQs is ~8 chunks; latency is acceptable for cron/ISR use.
 */
export async function extractClaimsFromDebate(
  debate: HansardDebate,
  options?: { generate?: LedgerGenerate; context?: LedgerContext },
): Promise<{ claims: LedgerClaim[]; contributionsWithClaims: number }> {
  const generate = options?.generate ?? defaultGenerate;
  const context = options?.context ?? "pmqs";
  const byContribution = new Map(
    debate.contributions.map((c) => [c.externalId, c]),
  );

  const all: LedgerClaim[] = [];
  for (const chunk of chunkContributions(debate.contributions)) {
    let response: { text: string; provider: string; model: string };
    try {
      response = await generate({
        system: SYSTEM_PROMPT,
        user: buildChunkPrompt(chunk, context),
        maxTokens: 3000,
        temperature: 0,
        timeoutMs: 60_000,
      });
    } catch (error) {
      console.error("[ledger/extract] chunk failed:", error);
      continue; // partial results are fine; ingest is re-runnable
    }

    const stamp: LedgerExtractorStamp = {
      provider: response.provider,
      model: response.model,
      version: EXTRACTOR_VERSION,
    };

    for (const raw of parseExtractionResponse(response.text)) {
      const contribution = byContribution.get(raw.contribution_id);
      if (!contribution) continue;
      const claim = validateRawClaim(raw, contribution, debate, stamp, context);
      if (claim) all.push(claim);
    }
  }

  const deduped = dedupeClaims(all);
  const contributionsWithClaims = new Set(
    deduped.map((c) => c.contributionExternalId),
  ).size;
  return { claims: deduped, contributionsWithClaims };
}
