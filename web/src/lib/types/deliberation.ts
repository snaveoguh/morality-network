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
  confidence: number; // 0-1
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

