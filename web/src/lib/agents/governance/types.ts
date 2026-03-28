/**
 * governance/types.ts — Type definitions for the Governance Watcher Agent.
 */

export interface GovernanceProposal {
  /** Unique ID (protocol-specific, e.g., "nouns-123", "compound-456") */
  id: string;
  /** Protocol name */
  protocol: string;
  /** Proposal title */
  title: string;
  /** Proposer address */
  proposer: string;
  /** Current status */
  status: "pending" | "active" | "succeeded" | "defeated" | "queued" | "executed" | "canceled";
  /** Votes for (normalized to token count) */
  forVotes: number;
  /** Votes against */
  againstVotes: number;
  /** Abstain votes (if applicable) */
  abstainVotes: number;
  /** Block number when created */
  createdBlock: number;
  /** Block number when voting ends */
  endBlock: number;
  /** Short description excerpt */
  description: string;
  /** Estimated treasury impact in USD (if detectable) */
  treasuryImpactUsd: number | null;
  /** First seen timestamp */
  firstSeenAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

export interface GovernanceAlphaSignal {
  /** Reference to the proposal */
  proposalId: string;
  /** Protocol (e.g., "nouns", "compound", "aave") */
  protocol: string;
  /** The token that trades on HL/DEXes */
  tradeableAsset: string;
  /** Suggested direction */
  direction: "long" | "short";
  /** Signal confidence 0-1 */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** What triggered this signal */
  eventType:
    | "proposal-created"
    | "proposal-passing"
    | "proposal-failing"
    | "proposal-executed"
    | "large-vote-shift";
}

/** Governance protocols we track, mapped to their tradeable tokens */
export interface GovernanceProtocolConfig {
  id: string;
  name: string;
  /** Token symbol that trades on Hyperliquid / DEXes */
  tradeableToken: string;
  /** Tally organization slug (for Tally API queries) */
  tallySlug: string;
  /** Chain ID for onchain lookups */
  chainId: number;
}

/** Default protocols to monitor */
export const GOVERNANCE_PROTOCOLS: GovernanceProtocolConfig[] = [
  {
    id: "compound",
    name: "Compound",
    tradeableToken: "COMP",
    tallySlug: "compound",
    chainId: 1,
  },
  {
    id: "aave",
    name: "Aave",
    tradeableToken: "AAVE",
    tallySlug: "aave",
    chainId: 1,
  },
  {
    id: "uniswap",
    name: "Uniswap",
    tradeableToken: "UNI",
    tallySlug: "uniswap",
    chainId: 1,
  },
  {
    id: "ens",
    name: "ENS",
    tradeableToken: "ENS",
    tallySlug: "ens",
    chainId: 1,
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    tradeableToken: "ARB",
    tallySlug: "arbitrum",
    chainId: 42161,
  },
  {
    id: "optimism",
    name: "Optimism",
    tradeableToken: "OP",
    tallySlug: "optimism",
    chainId: 10,
  },
];
