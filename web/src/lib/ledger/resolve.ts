// Claim Ledger — Phase B resolution agent.
//
// Proposes verdicts for unresolved retrodictable claims by comparing them
// against records fetched from primary sources (Commons divisions, ONS time
// series). Proposals land in the human review queue with status 'proposed';
// nothing here publishes anything.
//
// Integrity architecture (mirrors extract.ts):
//   - The model only CHOOSES among records this module fetched itself.
//     A cited record id outside the candidate set voids the proposal.
//   - Evidence URLs and excerpts are assembled server-side from the fetched
//     records — never taken from model output.
//   - Verdict vocabulary is fixed: true / false / partial / unresolved.

import { createHash } from "node:crypto";
import {
  divisionUrl,
  memberVotingRecord,
  searchDivisions,
  type DivisionRecord,
} from "./sources/divisions";
import { fetchAllOnsSeries, type OnsSeriesData } from "./sources/ons";
import type {
  LedgerClaim,
  LedgerEvidence,
  LedgerResolution,
  LedgerVerdict,
} from "./types";

export const RESOLVER_VERSION = "resolve-v1";

/** Proposals below this model-stated confidence are not queued at all. */
const MIN_CONFIDENCE = 0.6;

const VALID_VERDICTS = new Set<LedgerVerdict>([
  "true",
  "false",
  "partial",
  "unresolved",
]);

export interface RawResolutionProposal {
  verdict: string;
  /** Record ids the model cites: division ids or ONS series keys. */
  cited_records: Array<string | number>;
  /** One-paragraph basis, shown to the human reviewer. */
  basis: string;
  confidence: number;
}

export type ResolverGenerate = (req: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}) => Promise<{ text: string; provider: string; model: string }>;

const defaultGenerate: ResolverGenerate = async (req) => {
  const { generateTextForTask } = await import("../ai-provider");
  const result = await generateTextForTask({
    task: "claimLedgerResolution",
    ...req,
  });
  return { text: result.text, provider: result.provider, model: result.model };
};

const SYSTEM_PROMPT = `You compare a UK political claim against official records and propose a verdict for HUMAN REVIEW. You never publish anything.

Verdict vocabulary (fixed — records cannot show motive, so never speculate about intent):
- "true": the records support the claim as stated.
- "false": the records contradict the claim as stated.
- "partial": the records support part of the claim but contradict or fail to support another material part.
- "unresolved": the provided records cannot settle the claim either way.

Rules:
1. Judge ONLY against the records provided below. If they are insufficient, the verdict is "unresolved" — never reason from memory or general knowledge.
2. cited_records must list the ids of the records your verdict rests on, exactly as given. An "unresolved" verdict may cite nothing.
3. basis: 2-3 plain sentences a reviewer can check in one minute. State what the records show, no adjectives, no motive language.
4. confidence: 0 to 1 — how well the cited records settle the claim as stated. Be conservative; a number in a claim that differs from the record is not "approximately true".

Output ONLY a JSON object:
{"verdict": "...", "cited_records": [...], "basis": "...", "confidence": 0.0}`;

export function parseResolutionResponse(
  text: string,
): RawResolutionProposal | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]);
    if (
      !raw ||
      typeof raw.verdict !== "string" ||
      !Array.isArray(raw.cited_records) ||
      typeof raw.basis !== "string" ||
      typeof raw.confidence !== "number"
    ) {
      return null;
    }
    return raw as RawResolutionProposal;
  } catch {
    return null;
  }
}

export function resolutionId(claimId: string, citedKey: string): string {
  return createHash("sha256")
    .update(`${claimId}\n${citedKey}\n${RESOLVER_VERSION}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Validate a raw proposal against the candidate record set and assemble the
 * evidence chain from OUR copies of the cited records. Returns null when the
 * proposal is malformed, cites unknown records, or is under-confident.
 */
export function validateProposal(params: {
  raw: RawResolutionProposal;
  claim: LedgerClaim;
  /** id → server-assembled evidence for every candidate record. */
  candidateEvidence: Map<string, LedgerEvidence>;
  resolvedBy: string;
}): LedgerResolution | null {
  const { raw, claim, candidateEvidence, resolvedBy } = params;

  if (!VALID_VERDICTS.has(raw.verdict as LedgerVerdict)) return null;
  const verdict = raw.verdict as LedgerVerdict;

  const basis = raw.basis.trim();
  if (basis.length < 20 || basis.length > 1200) return null;

  const confidence = raw.confidence;
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return null;

  const citedKeys = raw.cited_records.map(String);
  const evidence: LedgerEvidence[] = [];
  for (const key of citedKeys) {
    const entry = candidateEvidence.get(key);
    if (!entry) return null; // cites a record we did not provide — void
    evidence.push(entry);
  }

  // Every verdict except 'unresolved' needs a document chain.
  if (verdict !== "unresolved" && evidence.length === 0) return null;

  return {
    id: resolutionId(claim.id, citedKeys.sort().join(",") || "none"),
    claimId: claim.id,
    verdict,
    evidence,
    reasoning: basis,
    resolvedBy,
    reviewedBy: null,
    status: "proposed",
    reviewNote: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };
}

// ── Candidate assembly per topic ────────────────────────────────────────────

function divisionEvidence(record: DivisionRecord): LedgerEvidence {
  const memberLine =
    record.memberVotedAye === undefined
      ? ""
      : ` Member voted ${record.memberVotedAye ? "Aye" : "No"}.`;
  return {
    url: divisionUrl(record.divisionId),
    excerpt: `Division ${record.divisionId} (${record.date}): "${record.title}" — Ayes ${record.ayeCount}, Noes ${record.noCount}.${memberLine}`,
    kind: "division",
  };
}

function onsEvidence(series: OnsSeriesData): LedgerEvidence {
  const recent = series.recent
    .slice(-6)
    .map((o) => `${o.period}: ${o.value}${series.unit}`)
    .join("; ");
  return {
    url: series.url,
    excerpt: `ONS ${series.title} (series ${series.seriesId.toUpperCase()}) — ${recent}.`,
    kind: "ons",
  };
}

async function votingRecordCandidates(
  claim: LedgerClaim,
): Promise<{ prompt: string; evidence: Map<string, LedgerEvidence> } | null> {
  const uttered = new Date(`${claim.utteredAt}T00:00:00Z`);
  const windowStart = new Date(uttered.getTime() - 60 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [recent, memberVotes] = await Promise.all([
    searchDivisions({ startDate: windowStart, endDate: claim.utteredAt, take: 25 }),
    claim.speaker.memberId
      ? memberVotingRecord(claim.speaker.memberId, 25)
      : Promise.resolve([]),
  ]);

  const byId = new Map<string, DivisionRecord>();
  // Member-specific rows win: they carry how the speaker voted.
  for (const record of [...recent, ...memberVotes]) {
    byId.set(String(record.divisionId), record);
  }
  if (byId.size === 0) return null;

  const evidence = new Map<string, LedgerEvidence>();
  const lines: string[] = [];
  for (const [id, record] of byId) {
    evidence.set(id, divisionEvidence(record));
    lines.push(`[${id}] ${evidence.get(id)!.excerpt}`);
  }

  return {
    prompt: `Commons division records (60 days before the claim; [id] prefixes are the citable record ids):\n${lines.join("\n")}`,
    evidence,
  };
}

async function statisticsCandidates(): Promise<{
  prompt: string;
  evidence: Map<string, LedgerEvidence>;
} | null> {
  const series = await fetchAllOnsSeries();
  if (series.length === 0) return null;

  const evidence = new Map<string, LedgerEvidence>();
  const lines: string[] = [];
  for (const s of series) {
    evidence.set(s.key, onsEvidence(s));
    lines.push(`[${s.key}] ${evidence.get(s.key)!.excerpt}`);
  }

  return {
    prompt: `ONS time series (official statistics; [id] prefixes are the citable record ids):\n${lines.join("\n")}`,
    evidence,
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export type ResolvableTopic = "voting-record" | "statistics";

export function isResolvableClaim(claim: LedgerClaim): claim is LedgerClaim & {
  topic: ResolvableTopic;
} {
  return (
    claim.claimType === "retrodictable" &&
    (claim.topic === "voting-record" || claim.topic === "statistics")
  );
}

/**
 * Propose a resolution for one claim. Returns null when no candidate records
 * exist, the model abstains, or validation voids the proposal — all of which
 * simply leave the claim unresolved.
 */
export async function proposeResolution(
  claim: LedgerClaim,
  options?: { generate?: ResolverGenerate },
): Promise<LedgerResolution | null> {
  if (!isResolvableClaim(claim)) return null;
  const generate = options?.generate ?? defaultGenerate;

  const candidates =
    claim.topic === "voting-record"
      ? await votingRecordCandidates(claim)
      : await statisticsCandidates();
  if (!candidates) return null;

  const user = [
    `CLAIM under review:`,
    `- Speaker: ${claim.speaker.name}${claim.speaker.party ? ` (${claim.speaker.party})` : ""}`,
    `- Said on: ${claim.utteredAt} at Prime Minister's Questions`,
    `- Verbatim: "${claim.verbatimQuote}"`,
    `- Normalized: ${claim.normalizedClaim}`,
    ``,
    candidates.prompt,
  ].join("\n");

  let response: { text: string; provider: string; model: string };
  try {
    response = await generate({
      system: SYSTEM_PROMPT,
      user,
      maxTokens: 1200,
      temperature: 0,
      timeoutMs: 60_000,
    });
  } catch (error) {
    console.error("[ledger/resolve] generation failed:", error);
    return null;
  }

  const raw = parseResolutionResponse(response.text);
  if (!raw) return null;

  return validateProposal({
    raw,
    claim,
    candidateEvidence: candidates.evidence,
    resolvedBy: `agent:${response.provider}/${response.model}@${RESOLVER_VERSION}`,
  });
}
