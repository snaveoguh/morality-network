import { type Address } from "viem";

// MO Token on Base
export const MO_TOKEN = {
  address: "0x8729c70061739140ee6bE00A3875Cbf6d09A746C" as Address,
  symbol: "MO",
  name: "mo",
  decimals: 18,
} as const;

// ERC20 ABI for MO token interactions
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// Contract addresses
// Defaults point to deployed Base Sepolia contracts; override via NEXT_PUBLIC_* env vars.
export const CONTRACTS = {
  registry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
    "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608") as Address,
  ratings: (process.env.NEXT_PUBLIC_RATINGS_ADDRESS ??
    "0xb61bE51E8aEd1360EaA03Eb673F74D66eC4898D7") as Address,
  comments: (process.env.NEXT_PUBLIC_COMMENTS_ADDRESS ??
    "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405") as Address,
  tipping: (process.env.NEXT_PUBLIC_TIPPING_ADDRESS ??
    "0x622cD30124e24dFFe77c29921bD7622e30d57F8B") as Address,
  leaderboard: (process.env.NEXT_PUBLIC_LEADERBOARD_ADDRESS ??
    "0x57dc0C9833A124FE39193dC6a554e0Ff37606202") as Address,
} as const;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "registerEntity",
    inputs: [
      { name: "identifier", type: "string" },
      { name: "entityType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimOwnership",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approveOwnershipClaim",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "claimer", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEntity",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "entityHash", type: "bytes32" },
          { name: "entityType", type: "uint8" },
          { name: "identifier", type: "string" },
          { name: "registeredBy", type: "address" },
          { name: "claimedOwner", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "computeHash",
    inputs: [{ name: "identifier", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getEntityCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "EntityRegistered",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "entityType", type: "uint8", indexed: false },
      { name: "identifier", type: "string", indexed: false },
      { name: "registeredBy", type: "address", indexed: true },
    ],
  },
] as const;

export const RATINGS_ABI = [
  {
    type: "function",
    name: "rate",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "score", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rateWithReason",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "score", type: "uint8" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAverageRating",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [
      { name: "avg", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserRating",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "score", type: "uint8" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRatingReason",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "reason", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Rated",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "rater", type: "address", indexed: true },
      { name: "score", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RatedWithReason",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "rater", type: "address", indexed: true },
      { name: "score", type: "uint8", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

export const COMMENTS_ABI = [
  {
    type: "function",
    name: "comment",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "content", type: "string" },
      { name: "parentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "vote",
    inputs: [
      { name: "commentId", type: "uint256" },
      { name: "v", type: "int8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getComment",
    inputs: [{ name: "commentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "entityHash", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "content", type: "string" },
          { name: "parentId", type: "uint256" },
          { name: "score", type: "int256" },
          { name: "tipTotal", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEntityComments",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEntityCommentCount",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CommentCreated",
    inputs: [
      { name: "commentId", type: "uint256", indexed: true },
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "parentId", type: "uint256", indexed: false },
    ],
  },
] as const;

export const TIPPING_ABI = [
  {
    type: "function",
    name: "tipEntity",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "tipComment",
    inputs: [{ name: "commentId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimEscrow",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "entityTipTotals",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalTipsGiven",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalTipsReceived",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "TipSent",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "tipper", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CommentTipped",
    inputs: [
      { name: "commentId", type: "uint256", indexed: true },
      { name: "tipper", type: "address", indexed: true },
      { name: "author", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const LEADERBOARD_ABI = [
  {
    type: "function",
    name: "getCompositeScore",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "aiScores",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateAIScore",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "score", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Entity type enum matching the Solidity enum
export enum EntityType {
  URL = 0,
  DOMAIN = 1,
  ADDRESS = 2,
  CONTRACT = 3,
}

// ============================================================================
// NOUNS TOKEN (Ethereum mainnet)
// ============================================================================

export const NOUNS_TOKEN_ADDRESS = "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03" as Address;

// ============================================================================
// PROPOSAL VOTING — Signal votes on DAO proposals
// Update after deployment
// ============================================================================

export const PROPOSAL_VOTING_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const PROPOSAL_VOTING_ABI = [
  {
    type: "function",
    name: "castVote",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
      { name: "support", type: "uint8" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getProposalVotes",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
    ],
    outputs: [
      { name: "forVotes", type: "uint256" },
      { name: "againstVotes", type: "uint256" },
      { name: "abstainVotes", type: "uint256" },
      { name: "totalVoters", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVote",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
      { name: "voter", type: "address" },
    ],
    outputs: [
      { name: "support", type: "uint8" },
      { name: "reason", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "voted", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "proposalKey", type: "bytes32", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "support", type: "uint8", indexed: false },
      { name: "isNounHolder", type: "bool", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundIssued",
    inputs: [
      { name: "voter", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

// ============================================================================
// PREDICTION MARKET — Parimutuel betting on DAO proposals
// Oracle = actual onchain vote result. Winners take the pot.
// Update after deployment
// ============================================================================

export const PREDICTION_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS ??
  "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B") as Address;

export const PREDICTION_MARKET_ABI = [
  {
    type: "function",
    name: "isDaoResolvable",
    inputs: [{ name: "dao", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "stake",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
      { name: "isFor", type: "bool" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getMarket",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
    ],
    outputs: [
      { name: "forPool", type: "uint256" },
      { name: "againstPool", type: "uint256" },
      { name: "forStakers", type: "uint256" },
      { name: "againstStakers", type: "uint256" },
      { name: "forOddsBps", type: "uint256" },
      { name: "againstOddsBps", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "exists", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPosition",
    inputs: [
      { name: "dao", type: "string" },
      { name: "proposalId", type: "string" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "forStake", type: "uint256" },
      { name: "againstStake", type: "uint256" },
      { name: "claimed", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "StakePlaced",
    inputs: [
      { name: "proposalKey", type: "bytes32", indexed: true },
      { name: "staker", type: "address", indexed: true },
      { name: "isFor", type: "bool", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { name: "proposalKey", type: "bytes32", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WinningsClaimed",
    inputs: [
      { name: "proposalKey", type: "bytes32", indexed: true },
      { name: "staker", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
    ],
  },
] as const;
