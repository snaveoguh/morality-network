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

// Contract addresses — update after deployment to Base
export const CONTRACTS = {
  registry: "0x0000000000000000000000000000000000000000" as Address,
  ratings: "0x0000000000000000000000000000000000000000" as Address,
  comments: "0x0000000000000000000000000000000000000000" as Address,
  tipping: "0x0000000000000000000000000000000000000000" as Address,
  leaderboard: "0x0000000000000000000000000000000000000000" as Address,
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
    type: "event",
    name: "Rated",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "rater", type: "address", indexed: true },
      { name: "score", type: "uint8", indexed: false },
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
