// Claim Ledger — shared types.
// Source of truth: docs/CLAIM_LEDGER_SPEC.md. Ledger vocabulary is fixed:
// claims resolve to true / false / partial / unresolved / unfalsifiable.
// Nothing in this module may express or infer motive.

/** How a claim can, in principle, be checked. */
export type LedgerClaimType = "retrodictable" | "predictive" | "unfalsifiable";

/**
 * Where a claim was uttered. Tier 1 = pmqs; Tier 2 backfill adds budget +
 * manifesto. 'company-statement' = a manufacturer's own published statement
 * (product page, blog, press release) — migration 018.
 */
export type LedgerContext = "pmqs" | "budget" | "manifesto" | "company-statement";

/** Who a claim is attributed to. 'mp' rows key on member_id; every other
 *  kind keys on pooter.ledger_entities (migration 018). */
export type LedgerEntityKind = "mp" | "manufacturer";

/** Rough resolution category — drives which source resolves it in Phase B. */
export type LedgerClaimTopic =
  | "statistics"
  | "voting-record"
  | "policy-outcome"
  | "spending"
  | "security-privacy"
  | "other";

export interface LedgerSpeaker {
  /** Canonical Parliament Members API id. Null for unattributed items and
   *  for non-MP entities. */
  memberId: number | null;
  /** pooter.ledger_entities id for non-MP entities (e.g. a manufacturer). */
  entityId?: string | null;
  /** Display name as attributed by Hansard (title stripped where possible). */
  name: string;
  /** Party code as printed in Hansard, e.g. "Lab", "Con", "LD". */
  party: string | null;
  constituency: string | null;
}

/** One speaker turn inside a Hansard debate section. */
export interface HansardContribution {
  /** Hansard contribution ExternalId (GUID). */
  externalId: string;
  speaker: LedgerSpeaker;
  /** Plain text with Hansard markup stripped. */
  text: string;
  orderInSection: number;
  /** Deep link to the contribution on hansard.parliament.uk. */
  sourceUrl: string;
}

export interface HansardDebate {
  /** Hansard debate section ExtId (GUID). */
  extId: string;
  title: string;
  house: "Commons" | "Lords";
  /** ISO date of the sitting (no time component). */
  date: string;
  /** Link to the debate section on hansard.parliament.uk. */
  sourceUrl: string;
  contributions: HansardContribution[];
}

/** Stamp identifying exactly which agent produced an extraction. */
export interface LedgerExtractorStamp {
  provider: string;
  model: string;
  /** Prompt/pipeline version — bump when the extraction prompt changes. */
  version: string;
}

/**
 * An extracted, unresolved claim. Phase A publishes these verbatim with a
 * source link and NO verdict of any kind.
 */
export interface LedgerClaim {
  /** Deterministic id: sha256(contribution ExternalId + verbatim quote). */
  id: string;
  speaker: LedgerSpeaker;
  /** Exact substring of the Hansard contribution text. Never paraphrased. */
  verbatimQuote: string;
  /** Neutral restatement of the checkable proposition. No motive language. */
  normalizedClaim: string;
  claimType: LedgerClaimType;
  topic: LedgerClaimTopic;
  /** ISO date by which a predictive claim becomes checkable, if stated. */
  resolutionDue: string | null;
  /** Deep link to the contribution on hansard.parliament.uk. */
  sourceUrl: string;
  /** Hansard contribution ExternalId the quote came from. */
  contributionExternalId: string;
  /** ISO date of utterance (sitting date). */
  utteredAt: string;
  context: LedgerContext;
  extractedBy: LedgerExtractorStamp;
  /** Times the same normalized claim appeared in the session. */
  occurrences: number;
}

// ── Phase B: resolution ─────────────────────────────────────────────────────

/** Ledger verdict vocabulary. Fixed by spec — never extended with motive. */
export type LedgerVerdict = "true" | "false" | "partial" | "unresolved";

export type LedgerResolutionStatus = "proposed" | "published" | "rejected";

/**
 * One link in a verdict's document chain. URLs are constructed server-side
 * from records we fetched ourselves — never taken from model output.
 */
export const LEDGER_EVIDENCE_KINDS = [
  "division",
  "ons",
  "hansard",
  "obr",
  // migration 018: regulator findings/orders (FTC, ICO, state AGs) and the
  // entity's own later statements (incident notices, advisories).
  "regulator",
  "company",
  "other",
] as const;

export type LedgerEvidenceKind = (typeof LEDGER_EVIDENCE_KINDS)[number];

export interface LedgerEvidence {
  url: string;
  /** What the record shows, stated from the fetched data. */
  excerpt: string;
  /** 'obr' and 'other' are human-curated at review time (spec: OBR
   *  evaluation reports, court judgments, inquiries). */
  kind: LedgerEvidenceKind;
}

export interface LedgerResolution {
  id: string;
  claimId: string;
  verdict: LedgerVerdict;
  evidence: LedgerEvidence[];
  /** Agent's stated basis — shown to the human reviewer, not published. */
  reasoning: string;
  resolvedBy: string; // 'agent:<provider>/<model>@<version>' | 'human:<id>'
  reviewedBy: string | null; // 'human:<id>' — REQUIRED to publish false/partial
  status: LedgerResolutionStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface LedgerWeekSnapshot {
  debate: Pick<HansardDebate, "extId" | "title" | "house" | "date" | "sourceUrl">;
  claims: LedgerClaim[];
  /** Contributions scanned vs contributions that yielded checkable claims. */
  contributionsScanned: number;
  contributionsWithClaims: number;
  generatedAt: string;
}
