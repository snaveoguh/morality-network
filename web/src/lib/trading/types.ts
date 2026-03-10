import type { Address, Hash } from "viem";

export type DexKind = "uniswap-v3" | "aerodrome";
export type ExecutionVenue = "base-spot" | "hyperliquid-perp";

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
  venue?: ExecutionVenue;
  tokenAddress: Address;
  tokenDecimals: number;
  quoteTokenAddress: Address;
  quoteSymbol: string;
  quoteTokenDecimals: number;
  dex: DexKind;
  marketSymbol?: string;
  marketId?: number;
  leverage?: number;
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

export interface HyperliquidConfig {
  apiUrl: string;
  isTestnet: boolean;
  accountAddress?: Address;
  defaultMarket: string;
  defaultLeverage: number;
  entryNotionalUsd: number;
  minAccountValueUsd: number;
}

export interface TraderExecutionConfig {
  executionVenue: ExecutionVenue;
  dryRun: boolean;
  performanceFeeBps: number;
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
  hyperliquid: HyperliquidConfig;
}

export interface SwapResult {
  txHash: Hash;
  amountOutRaw?: bigint;
}

export interface TraderCycleReport {
  startedAt: number;
  finishedAt: number;
  dryRun: boolean;
  executionVenue: ExecutionVenue;
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
  executionVenue: ExecutionVenue;
  dryRun: boolean;
  account: Address;
  scannerCandidates: number;
  scannerFetchError?: string;
  minScannerCandidatesLive: number;
  balances: TraderReadinessBalance[];
  liveReady: boolean;
  reasons: string[];
}

export interface TraderOpenPositionMetric {
  position: Position;
  currentPriceUsd: number | null;
  marketValueUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
}

export interface TraderClosedPositionMetric {
  position: Position;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
}

export interface TraderPerformanceTotals {
  openPositions: number;
  closedPositions: number;
  deployedUsd: number;
  openMarketValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  grossPnlUsd: number;
  performanceFeeUsd: number;
  netPnlAfterFeeUsd: number;
}

export interface TraderPerformanceReport {
  timestamp: number;
  executionVenue: ExecutionVenue;
  dryRun: boolean;
  account: Address;
  fundingAddress: Address;
  performanceFeeBps: number;
  readiness: TraderReadinessReport;
  totals: TraderPerformanceTotals;
  open: TraderOpenPositionMetric[];
  closed: TraderClosedPositionMetric[];
}
