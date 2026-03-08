import type { Address, Hash } from "viem";

export type DexKind = "uniswap-v3" | "aerodrome";

export interface ScoreBreakdown {
  [key: string]: number;
}

export interface ScannerDexScreenerData {
  priceUsd?: string;
  liquidity?: number;
  volume24h?: number;
  pairUrl?: string;
}

export interface ScannerTokenMeta {
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
}

export interface ScannerLaunch {
  tokenAddress: Address;
  poolAddress?: Address;
  dex: DexKind;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  pairedAsset?: string;
  tokenMeta?: ScannerTokenMeta;
  dexScreenerData?: ScannerDexScreenerData;
  [key: string]: unknown;
}

export interface Position {
  id: string;
  tokenAddress: Address;
  tokenDecimals: number;
  quoteTokenAddress: Address;
  quoteSymbol: string;
  quoteTokenDecimals: number;
  dex: DexKind;
  poolAddress?: Address;
  entryPriceUsd: number;
  quantityTokenRaw: string;
  quoteSpentRaw: string;
  entryNotionalUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  openedAt: number;
  txHash?: Hash;
  status: "open" | "closed";
  closedAt?: number;
  exitReason?: "stop-loss" | "take-profit" | "manual";
  exitPriceUsd?: number;
  exitTxHash?: Hash;
}

export interface TraderRiskConfig {
  minScore: number;
  maxOpenPositions: number;
  maxNewEntriesPerCycle: number;
  maxPositionUsd: number;
  maxPortfolioUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  slippageBps: number;
}

export interface TraderSafetyConfig {
  minScannerCandidatesLive: number;
  minBaseEthForGas: number;
}

export interface TraderExecutionConfig {
  dryRun: boolean;
  rpcUrl: string;
  privateKey: `0x${string}`;
  scannerApiUrl: string;
  scannerRequestTimeoutMs: number;
  pollWindowSeconds: number;
  positionStorePath: string;
  gasMultiplierBps: number;
  maxPriorityFeePerGas: bigint;
  uniswapV3Router: Address;
  uniswapV3PoolFee: number;
  aerodromeRouter: Address;
  aerodromeFactory: Address;
  quoteTokens: Record<string, Address>;
  quoteTokenDecimals: Record<string, number>;
  entryBudgetRaw: Record<string, bigint>;
  risk: TraderRiskConfig;
  safety: TraderSafetyConfig;
}

export interface SwapResult {
  txHash: Hash;
  amountOutRaw?: bigint;
}

export interface TraderCycleReport {
  startedAt: number;
  finishedAt: number;
  dryRun: boolean;
  scannerCandidates: number;
  openPositions: number;
  entries: Position[];
  exits: Position[];
  skipped: string[];
  errors: string[];
  readiness?: TraderReadinessReport;
}

export interface TraderReadinessBalance {
  symbol: string;
  address: Address | "native";
  raw: string;
  decimals: number;
  formatted: string;
  requiredRaw?: string;
  requiredFormatted?: string;
  meetsRequirement: boolean;
}

export interface TraderReadinessReport {
  timestamp: number;
  dryRun: boolean;
  account: Address;
  scannerCandidates: number;
  scannerFetchError?: string;
  minScannerCandidatesLive: number;
  balances: TraderReadinessBalance[];
  liveReady: boolean;
  reasons: string[];
}
