import type { Address, Hash } from "viem";

export type DexKind = "uniswap-v3" | "aerodrome";
export type ExecutionVenue = "base-spot" | "ethereum-spot" | "hyperliquid-perp";

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
  direction?: "long" | "short";
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
  exitReason?: "stop-loss" | "take-profit" | "trailing-stop" | "signal-reversal" | "expired" | "manual" | "max-hold-time";
  exitPriceUsd?: number;
  exitTxHash?: Hash;
  trailingStopPct?: number;
  highWaterMark?: number;
  lowWaterMark?: number;
  signalSource?: string;
  signalConfidence?: number;
  kellyFraction?: number;
  /** Moral score at time of entry (0-100). SOUL.md requires >70 for long, <30 for short. */
  moralScore?: number;
  /** Human-readable moral justification for the trade. SOUL.md §Trading Constraints. */
  moralJustification?: string;
  /** Structured entry rationale — why the trade was opened */
  entryRationale?: EntryRationale;
  /** Structured exit rationale — what triggered the close */
  exitRationale?: ExitRationale;
}

export interface EntryRationale {
  signalSymbol?: string;
  signalDirection?: string;
  signalScore?: number;
  signalObservations?: number;
  contradictionPenalty?: number;
  supportingClaims?: string[];
  skippedSignals?: string[];
  kellyPhase?: string;
  kellySizeUsd?: number;
  actualSizeUsd?: number;
  compositeDirection?: string;
  compositeConfidence?: number;
  compositeReasons?: string[];
  technicalDirection?: string;
  technicalStrength?: number;
  patternDirection?: string;
  patternNames?: string[];
  agreementMet?: boolean;
}

export interface ExitRationale {
  trigger: string;
  priceAtTrigger?: number;
  highWaterMark?: number;
  drawdownFromPeak?: number;
  holdDurationMs?: number;
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
  maxLeverage: number;
  minSignalConfidence: number;
  trailingStopPct: number;
  trailingStopActivationPct: number;
  circuitBreakerLosses: number;
  circuitBreakerPauseMs: number;
  maxHoldMs?: number;
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
  /** markets to scan each cycle (e.g., ["BTC","ETH","SOL"]) */
  watchMarkets: string[];
}

export interface VaultStrategyConfig {
  enabled: boolean;
  allocateBufferBps: number;
  autoSettleWhenFlat: boolean;
  autoReportLossWhenFlat: boolean;
  minReserveEthRaw: bigint;
}

export interface VaultRailConfig {
  enabled: boolean;
  baseVaultAddress: Address;
  reserveAllocatorAddress?: Address;
  bridgeRouterAddress: Address;
  navReporterAddress: Address;
  assetConverterAddress?: Address;
  bridgeAdapterAddress?: Address;
  arbTransitEscrowAddress?: Address;
  hlStrategyManagerAddress?: Address;
  baseBridgeAssetAddress: Address;
  arbBridgeAssetAddress: Address;
  baseChainId: number;
  baseRpcUrl: string;
  arbRpcUrl: string;
  arbChainId: number;
  autoReportNav: boolean;
  minNavIntervalMs: number;
  navFeeEthRaw: bigint;
  navEthPriceUsdOverride?: number;
}

export interface SignalWeights {
  technical: number;
  pattern: number;
  news: number;
}

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryTimestamp: number;
  exitTimestamp?: number;
  entryPrice: number;
  exitPrice?: number;
  leverage: number;
  notionalUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
  holdDurationMs?: number;
  signalSource: string;
  compositeConfidence: number;
  kellyFraction: number;
  exitReason?: string;
  entryRationale?: EntryRationale;
  exitRationale?: ExitRationale;
  moralScore?: number;
  moralJustification?: string;
}

export interface ScalperConfig {
  enabled: boolean;
  markets: string[];
  candleThresholdPct: number;
  volumeSpikeMultiplier: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxPositionUsd: number;
  defaultLeverage: number;
  cooldownMs: number;
  maxHoldMs: number;
  maxOpenScalps: number;
  vwapDeviationPct: number;
  dryRun: boolean;
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
  vaultStrategy?: VaultStrategyConfig | null;
  vaultRail?: VaultRailConfig | null;
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
  /** Estimated round-trip exchange fees (entry already paid + estimated exit) */
  estimatedFeesUsd: number;
}

export interface TraderClosedPositionMetric {
  position: Position;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  /** Estimated round-trip exchange fees (entry + exit) */
  estimatedFeesUsd: number;
}

export interface TraderPerformanceTotals {
  openPositions: number;
  closedPositions: number;
  deployedUsd: number;
  openMarketValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  grossPnlUsd: number;
  /** Estimated total exchange trading fees across all positions */
  estimatedTradingFeesUsd: number;
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

/* ═══════════════════════  Scalper Types  ═══════════════════════ */

export interface ScalpSignal {
  symbol: string;
  timestamp: number;
  direction: "long" | "short";
  trigger: "big-candle" | "volume-spike" | "vwap-deviation" | "multi-confluence";
  confidence: number;
  triggerCandle: { open: number; high: number; low: number; close: number; volume: number; bodyPct: number };
  indicators: { rsi14: number; ema9: number; ema21: number; bollingerPercentB: number; vwap: number; volumeRatio: number; priceVsVwap: number };
  reasons: string[];
}

export interface ScalpPosition {
  id: string;
  symbol: string;
  marketId: number | null;
  direction: "long" | "short";
  entryPriceUsd: number;
  sizeRaw: string;
  notionalUsd: number;
  leverage: number;
  stopLossPriceUsd: number;
  takeProfitPriceUsd: number;
  openedAt: number;
  expiresAt: number;
  signal: ScalpSignal;
  status: "open" | "closed";
  closedAt?: number;
  exitPriceUsd?: number;
  exitReason?: "stop-loss" | "take-profit" | "timeout" | "manual";
  pnlUsd?: number;
}
