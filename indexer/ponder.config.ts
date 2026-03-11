import { createConfig } from "@ponder/core";
import { fallback, http } from "viem";

// Contract addresses — Base Sepolia (deployed March 2026)
const REGISTRY = (process.env.REGISTRY_ADDRESS ?? "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608") as `0x${string}`;
const RATINGS = (process.env.RATINGS_ADDRESS ?? "0xb61bE51E8aEd1360EaA03Eb673F74D66eC4898D7") as `0x${string}`;
const COMMENTS = (process.env.COMMENTS_ADDRESS ?? "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405") as `0x${string}`;
const TIPPING = (process.env.TIPPING_ADDRESS ?? "0x622cD30124e24dFFe77c29921bD7622e30d57F8B") as `0x${string}`;
const LEADERBOARD = (process.env.LEADERBOARD_ADDRESS ?? "0x57dc0C9833A124FE39193dC6a554e0Ff37606202") as `0x${string}`;

const START_BLOCK = Number(process.env.START_BLOCK ?? 0);

function parsePositiveInt(input: string | undefined, fallbackValue: number): number {
  if (!input) return fallbackValue;
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
  return Math.floor(parsed);
}

const rpcUrls = [
  process.env.PONDER_RPC_URL_1,
  process.env.PONDER_RPC_URL_2,
  process.env.PONDER_RPC_URL_3,
]
  .filter((value): value is string => Boolean(value))
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const rpcTransport =
  rpcUrls.length > 1
    ? fallback(
        rpcUrls.map((url) =>
          http(url, {
            timeout: parsePositiveInt(process.env.PONDER_RPC_TIMEOUT_MS, 10_000),
            retryCount: parsePositiveInt(process.env.PONDER_RPC_RETRY_COUNT, 2),
          }),
        ),
      )
    : http(rpcUrls[0] ?? "https://sepolia.base.org", {
        timeout: parsePositiveInt(process.env.PONDER_RPC_TIMEOUT_MS, 10_000),
        retryCount: parsePositiveInt(process.env.PONDER_RPC_RETRY_COUNT, 2),
      });

const databaseMode = (process.env.PONDER_DB_KIND ?? "pglite").toLowerCase();
const postgresConnectionString =
  process.env.DATABASE_PRIVATE_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

const database =
  databaseMode === "postgres" && postgresConnectionString
    ? {
        kind: "postgres" as const,
        connectionString: postgresConnectionString,
        poolConfig: {
          max: parsePositiveInt(process.env.PONDER_DB_POOL_MAX, 30),
        },
      }
    : {
        kind: "pglite" as const,
        directory: process.env.PONDER_PGLITE_DIR ?? ".ponder/pglite",
      };

// ============================================================================
// ABIs — Events only (Ponder only needs event signatures)
// ============================================================================

const REGISTRY_ABI = [
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
  {
    type: "event",
    name: "OwnershipClaimed",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "claimedOwner", type: "address", indexed: true },
    ],
  },
] as const;

const RATINGS_ABI = [
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
    name: "RatingUpdated",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "rater", type: "address", indexed: true },
      { name: "oldScore", type: "uint8", indexed: false },
      { name: "newScore", type: "uint8", indexed: false },
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
  {
    type: "event",
    name: "RatingWithReasonUpdated",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "rater", type: "address", indexed: true },
      { name: "oldScore", type: "uint8", indexed: false },
      { name: "newScore", type: "uint8", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

const COMMENTS_ABI = [
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
  {
    type: "event",
    name: "CommentVoted",
    inputs: [
      { name: "commentId", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "vote", type: "int8", indexed: false },
    ],
  },
] as const;

const TIPPING_ABI = [
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
    name: "TipEscrowed",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "tipper", type: "address", indexed: true },
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
  {
    type: "event",
    name: "EscrowClaimed",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

const LEADERBOARD_ABI = [
  {
    type: "event",
    name: "AIScoreUpdated",
    inputs: [
      { name: "entityHash", type: "bytes32", indexed: true },
      { name: "score", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export default createConfig({
  database,
  networks: {
    baseSepolia: {
      chainId: 84532,
      transport: rpcTransport,
      pollingInterval: parsePositiveInt(process.env.PONDER_POLL_MS, 1_500),
      maxRequestsPerSecond: parsePositiveInt(process.env.PONDER_RPC_MAX_RPS, 25),
    },
  },
  contracts: {
    MoralityRegistry: {
      network: "baseSepolia",
      abi: REGISTRY_ABI,
      address: REGISTRY,
      startBlock: START_BLOCK,
    },
    MoralityRatings: {
      network: "baseSepolia",
      abi: RATINGS_ABI,
      address: RATINGS,
      startBlock: START_BLOCK,
    },
    MoralityComments: {
      network: "baseSepolia",
      abi: COMMENTS_ABI,
      address: COMMENTS,
      startBlock: START_BLOCK,
    },
    MoralityTipping: {
      network: "baseSepolia",
      abi: TIPPING_ABI,
      address: TIPPING,
      startBlock: START_BLOCK,
    },
    MoralityLeaderboard: {
      network: "baseSepolia",
      abi: LEADERBOARD_ABI,
      address: LEADERBOARD,
      startBlock: START_BLOCK,
    },
  },
});
