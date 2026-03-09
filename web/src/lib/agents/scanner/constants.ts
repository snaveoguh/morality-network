// ─── Scanner Agent — Constants ──────────────────────────────────────────────

import { parseAbiItem } from "viem";
import type { DexId } from "./types";

function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ─── DEX Factory Addresses (Base Mainnet) ───────────────────────────────────

export interface FactoryConfig {
  id: DexId;
  address: `0x${string}`;
  event: ReturnType<typeof parseAbiItem>;
  /** Index of token0 in event args */
  token0Idx: number;
  /** Index of token1 in event args */
  token1Idx: number;
  label: string;
}

export const FACTORIES: FactoryConfig[] = [
  {
    id: "uniswap-v3",
    address: "0x33128a8fC17869897dcE68Ed026d694621f6FDaD",
    event: parseAbiItem(
      "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
    ),
    token0Idx: 0,
    token1Idx: 1,
    label: "Uniswap V3",
  },
  {
    id: "aerodrome",
    address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    event: parseAbiItem(
      "event PoolCreated(address indexed token0, address indexed token1, bool stable, address pool, uint256)"
    ),
    token0Idx: 0,
    token1Idx: 1,
    label: "Aerodrome",
  },
];

// ─── Known Quote Tokens (Base Mainnet) ──────────────────────────────────────
// These are "blue chip" tokens — if a pool pairs two unknowns, we skip it.
// All lowercased for comparison.

export const KNOWN_QUOTE_TOKENS = new Set([
  "0x4200000000000000000000000000000000000006", // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", // wstETH
]);

// Maps quote token addresses to human-readable names
export const QUOTE_TOKEN_NAMES: Record<string, string> = {
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "USDbC",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": "cbETH",
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": "wstETH",
};

// ─── ERC20 ABI (minimal for metadata) ───────────────────────────────────────

export const ERC20_META_ABI = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

// ─── Polling / Scan Settings ────────────────────────────────────────────────

/** Seconds between poll cycles */
export const POLL_INTERVAL_MS = 4_000;

/** Max blocks per getLogs chunk (Base = fast blocks, keep chunks small) */
export const LOG_CHUNK_SIZE = 2_000;

/** Hard cap of blocks scanned per factory in a single poll cycle */
export const MAX_BLOCKS_PER_POLL = numberFromEnv(
  "SCANNER_MAX_BLOCKS_PER_POLL",
  1_200
);

/** Hard cap of PoolCreated logs processed per factory per poll */
export const MAX_LOGS_PER_FACTORY_PER_POLL = numberFromEnv(
  "SCANNER_MAX_LOGS_PER_FACTORY_PER_POLL",
  20
);

/** How far back to scan on first start (default ~12 hours on Base) */
export const INITIAL_LOOKBACK_BLOCKS = numberFromEnv(
  "SCANNER_INITIAL_LOOKBACK_BLOCKS",
  20_000
);

/** Minimum time between API-triggered polls in serverless mode */
export const API_POLL_COOLDOWN_MS = numberFromEnv(
  "SCANNER_API_POLL_COOLDOWN_MS",
  15_000
);

/** Max launches to store (FIFO eviction) */
export const MAX_STORED_LAUNCHES = 500;

/** Delay before DexScreener enrichment (ms) — give pools time to get indexed */
export const DEXSCREENER_DELAY_MS = 30_000;

/** DexScreener API base */
export const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/pairs/base";

/** Basescan API base */
export const BASESCAN_API = "https://api.basescan.org/api";

// ─── Scoring Weights (sum = 100) ────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  contractVerified: 25,
  initialLiquidity: 25,
  holderCount: 15,
  deployerHistory: 15,
  lockedLiquidity: 10,
  deployerAge: 10,
} as const;

/** Persistence path */
export const SCANNER_DATA_PATH =
  process.env.SCANNER_DATA_PATH || "/tmp/pooter-scanner-launches.json";
