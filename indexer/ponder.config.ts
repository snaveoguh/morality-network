import { createConfig } from "@ponder/core";
import { fallback, http } from "viem";

const networkMode = (process.env.PONDER_NETWORK ?? "base").trim().toLowerCase();
const useBaseSepolia = networkMode === "basesepolia" || networkMode === "base-sepolia";
const networkName = useBaseSepolia ? "baseSepolia" : "base";
const defaultRpcUrl = useBaseSepolia ? "https://sepolia.base.org" : "https://mainnet.base.org";

// Contract addresses — default to Base mainnet launch deployments, override via env for staging.
const REGISTRY = (
  process.env.REGISTRY_ADDRESS ??
  (useBaseSepolia
    ? "0x1c73efffeb89ad8699770921dbd860bb5da5b15a"
    : "0x2ea7502c4db5b8cfb329d8a9866eb6705b036608")
) as `0x${string}`;
const RATINGS = (
  process.env.RATINGS_ADDRESS ??
  (useBaseSepolia
    ? "0x29f0235d74e09536f0b7df9c6529de17b8af5fc6"
    : "0x29f66d8b15326ce7232c0277dbc2cbfdaaf93405")
) as `0x${string}`;
const COMMENTS = (
  process.env.COMMENTS_ADDRESS ??
  (useBaseSepolia
    ? "0x14a361454edcb477644eb82bf540a26e1cead72a"
    : "0x66ba3ce1280bf86dfe957b52e9888a1de7f81d7b")
) as `0x${string}`;
const TIPPING = (
  process.env.TIPPING_ADDRESS ??
  (useBaseSepolia
    ? "0x71b2e273727385c617fe254f4fb14a36a679b12a"
    : "0x27c79a57be68eb62c9c6bb19875db76d33fd099b")
) as `0x${string}`;
const LEADERBOARD = (
  process.env.LEADERBOARD_ADDRESS ??
  (useBaseSepolia
    ? "0x4b48d35e019129bb5a16920adc4cb7f445ec8ca5"
    : "0x29f0235d74e09536f0b7df9c6529de17b8af5fc6")
) as `0x${string}`;

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
    : http(rpcUrls[0] ?? defaultRpcUrl, {
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
  networks: useBaseSepolia
    ? {
        baseSepolia: {
          chainId: 84532,
          transport: rpcTransport,
          pollingInterval: parsePositiveInt(process.env.PONDER_POLL_MS, 1_500),
          maxRequestsPerSecond: parsePositiveInt(process.env.PONDER_RPC_MAX_RPS, 25),
        },
      }
    : {
        base: {
          chainId: 8453,
          transport: rpcTransport,
          pollingInterval: parsePositiveInt(process.env.PONDER_POLL_MS, 1_500),
          maxRequestsPerSecond: parsePositiveInt(process.env.PONDER_RPC_MAX_RPS, 25),
        },
      },
  contracts: {
    MoralityRegistry: {
      network: networkName,
      abi: REGISTRY_ABI,
      address: REGISTRY,
      startBlock: START_BLOCK,
    },
    MoralityRatings: {
      network: networkName,
      abi: RATINGS_ABI,
      address: RATINGS,
      startBlock: START_BLOCK,
    },
    MoralityComments: {
      network: networkName,
      abi: COMMENTS_ABI,
      address: COMMENTS,
      startBlock: START_BLOCK,
    },
    MoralityTipping: {
      network: networkName,
      abi: TIPPING_ABI,
      address: TIPPING,
      startBlock: START_BLOCK,
    },
    MoralityLeaderboard: {
      network: networkName,
      abi: LEADERBOARD_ABI,
      address: LEADERBOARD,
      startBlock: START_BLOCK,
    },
  },
});
