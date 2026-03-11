// ─── Shared Types for Entity System ──────────────────────────────────────────

// Entity mentions extracted from article text
export interface EntityMention {
  name: string;
  canonicalName: string;
  type: "person" | "organization" | "country" | "place";
  context: string; // One-line summary of this entity's relevance to the article
  biasContext?: string; // How bias connects to this entity
  newsContext?: string; // Recent news context
  occurrences: EntityOccurrence[];
}

export interface EntityOccurrence {
  paragraphIndex: number;
  startChar: number;
  endChar: number;
}

// ─── Argument Types (matches Solidity enum in Comments.sol) ──────────────────

export enum ArgumentType {
  Discussion = 0,
  Claim = 1,
  Counterclaim = 2,
  Evidence = 3,
  Source = 4,
}

export const ARGUMENT_TYPE_LABELS: Record<ArgumentType, string> = {
  [ArgumentType.Discussion]: "Discussion",
  [ArgumentType.Claim]: "Claim",
  [ArgumentType.Counterclaim]: "Counterclaim",
  [ArgumentType.Evidence]: "Evidence",
  [ArgumentType.Source]: "Source",
};

export const ARGUMENT_TYPE_STYLES: Record<ArgumentType, { bg: string; text: string; border: string }> = {
  [ArgumentType.Discussion]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
  [ArgumentType.Claim]: { bg: "var(--ink)", text: "var(--paper)", border: "var(--ink)" },
  [ArgumentType.Counterclaim]: { bg: "var(--accent-red)", text: "var(--paper)", border: "var(--accent-red)" },
  [ArgumentType.Evidence]: { bg: "transparent", text: "var(--ink-light)", border: "var(--rule)" },
  [ArgumentType.Source]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
};

// ─── Prediction Market Types ────────────────────────────────────────────────

export enum MarketOutcome {
  Unresolved = 0,
  For = 1,
  Against = 2,
}

export interface ParsedMarketData {
  forPool: bigint;
  againstPool: bigint;
  forStakers: number;
  againstStakers: number;
  forOddsBps: number;
  againstOddsBps: number;
  outcome: MarketOutcome;
  exists: boolean;
  totalPool: bigint;
  forPercent: number;
  againstPercent: number;
}

export interface ParsedPosition {
  forStake: bigint;
  againstStake: bigint;
  claimed: boolean;
  totalStake: bigint;
  side: "for" | "against" | "both" | "none";
}
