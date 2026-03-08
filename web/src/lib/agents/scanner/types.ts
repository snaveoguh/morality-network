// ─── Scanner Agent — Types ──────────────────────────────────────────────────

/** Supported DEX identifiers */
export type DexId = "uniswap-v3" | "aerodrome";

/** ERC20 metadata */
export interface TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string; // bigint serialized
}

/** DexScreener enrichment data (delayed fetch) */
export interface DexScreenerData {
  priceUsd: string | null;
  priceNative: string | null;
  liquidity: { usd: number; base: number; quote: number } | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairUrl: string | null;
  fdv: number | null;
  marketCap: number | null;
}

/** Score breakdown by category */
export interface ScoreBreakdown {
  contractVerified: number;    // 0-25
  initialLiquidity: number;    // 0-25
  holderCount: number;         // 0-15
  deployerHistory: number;     // 0-15
  lockedLiquidity: number;     // 0-10
  deployerAge: number;         // 0-10
}

/** A discovered token launch */
export interface TokenLaunch {
  /** Pool contract address */
  poolAddress: string;
  /** New token address */
  tokenAddress: string;
  /** Paired quote asset (WETH, USDC, etc.) */
  pairedAsset: string;
  /** Which DEX */
  dex: DexId;
  /** Block number of pool creation */
  blockNumber: number;
  /** Transaction hash */
  txHash: string;
  /** Deployer / pool creator address */
  deployer: string;
  /** Unix timestamp (seconds) of discovery */
  discoveredAt: number;
  /** ERC20 metadata */
  tokenMeta: TokenMeta | null;
  /** DexScreener data (populated after delay) */
  dexScreenerData: DexScreenerData | null;
  /** Composite score 0-100 */
  score: number;
  /** Score breakdown */
  scoreBreakdown: ScoreBreakdown | null;
  /** Whether enrichment has run */
  enriched: boolean;
}

/** Scanner internal state for snapshots */
export interface ScannerState {
  /** Last scanned block per DEX factory */
  lastBlockByFactory: Record<string, number>;
  /** Total launches found */
  totalLaunches: number;
  /** Launches in the last hour */
  launchesLastHour: number;
  /** Average score of recent launches */
  avgScore: number;
  /** Scanner uptime in seconds */
  uptimeSeconds: number;
}
