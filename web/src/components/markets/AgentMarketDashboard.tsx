"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatEther, parseEther, type Address } from "viem";
import { SiweMessage } from "siwe";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AGENT_VAULT_ABI } from "@/lib/contracts";
import type { TerminalTradingContext } from "@/lib/terminal-types";

const TradingChart = dynamic(
  () => import("@/components/markets/TradingChart"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] items-center justify-center border border-[var(--rule-light)] bg-[var(--paper-dark)] font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Loading chart...
      </div>
    ),
  },
);

const AgentBotTerminal = dynamic(
  () =>
    import("@/components/markets/AgentBotTerminal").then((m) => ({
      default: m.AgentBotTerminal,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[420px] border border-[var(--rule-light)] bg-[var(--paper-dark)] p-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Loading terminal...
      </div>
    ),
  },
);

const BASE_CAPITAL_VAULT_ABI = [
  {
    type: "function",
    name: "depositETH",
    stateMutability: "payable",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "requestWithdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface EntryRationale {
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

interface ExitRationale {
  trigger: string;
  priceAtTrigger?: number;
  highWaterMark?: number;
  drawdownFromPeak?: number;
  holdDurationMs?: number;
}

interface Position {
  id: string;
  venue?: "base-spot" | "ethereum-spot" | "hyperliquid-perp";
  tokenAddress: `0x${string}`;
  marketSymbol?: string;
  direction?: "long" | "short";
  leverage?: number;
  entryPriceUsd: number;
  entryNotionalUsd: number;
  openedAt: number;
  closedAt?: number;
  exitPriceUsd?: number;
  exitReason?: string;
  status: "open" | "closed";
  txHash?: `0x${string}`;
  exitTxHash?: `0x${string}`;
  signalSource?: string;
  signalConfidence?: number;
  kellyFraction?: number;
  moralScore?: number;
  moralJustification?: string;
  entryRationale?: EntryRationale;
  exitRationale?: ExitRationale;
}

interface OpenPositionMetric {
  position: Position;
  currentPriceUsd: number | null;
  marketValueUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  estimatedFeesUsd?: number;
}

interface ClosedPositionMetric {
  position: Position;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  estimatedFeesUsd?: number;
}

interface PerformanceTotals {
  openPositions: number;
  closedPositions: number;
  deployedUsd: number;
  openMarketValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  grossPnlUsd: number;
  estimatedTradingFeesUsd?: number;
  performanceFeeUsd: number;
  netPnlAfterFeeUsd: number;
}

interface ReadinessBalance {
  symbol: string;
  address: string;
  formatted: string;
  requiredFormatted?: string;
  meetsRequirement: boolean;
}

interface Readiness {
  executionVenue: "base-spot" | "ethereum-spot" | "hyperliquid-perp";
  dryRun: boolean;
  liveReady: boolean;
  reasons: string[];
  balances: ReadinessBalance[];
}

interface TraderPerformanceReport {
  timestamp: number;
  executionVenue: "base-spot" | "ethereum-spot" | "hyperliquid-perp";
  dryRun: boolean;
  account?: `0x${string}`;
  fundingAddress?: `0x${string}`;
  performanceFeeBps: number;
  readiness: Readiness;
  totals: PerformanceTotals;
  open: OpenPositionMetric[];
  closed: ClosedPositionMetric[];
}

interface VaultFunderSnapshot {
  address: `0x${string}`;
  shares: string;
  equityWei: string;
  depositedWei: string;
  withdrawnWei: string;
  pnlWei: string;
  pnlBps: string;
}

interface VaultOverview {
  enabled: true;
  chainId: number;
  address: `0x${string}`;
  manager?: `0x${string}`;
  feeRecipient?: `0x${string}`;
  performanceFeeBps: number;
  totalManagedAssetsWei: string;
  liquidAssetsWei: string;
  deployedCapitalWei: string;
  totalShares: string;
  sharePriceE18: string;
  cumulativeStrategyProfitWei: string;
  cumulativeStrategyLossWei: string;
  totalFeesPaidWei: string;
  funderCount: number;
  funders?: VaultFunderSnapshot[];
  account?: VaultFunderSnapshot | null;
}

interface VaultRailAccountSnapshot {
  address: `0x${string}`;
  shares: string;
  assetsEthWei: string;
  shareOfSupplyBps: string;
}

interface VaultRailOverview {
  enabled: true;
  runnerId: string;
  label: string;
  executionVenue: "base-spot" | "ethereum-spot" | "hyperliquid-perp";
  baseChainId: number;
  arbChainId: number;
  baseVaultAddress: `0x${string}`;
  reserveAllocatorAddress: `0x${string}` | null;
  bridgeRouterAddress: `0x${string}`;
  navReporterAddress: `0x${string}`;
  assetConverterAddress: `0x${string}` | null;
  bridgeAdapterAddress: `0x${string}` | null;
  arbTransitEscrowAddress: `0x${string}` | null;
  hlStrategyManagerAddress: `0x${string}` | null;
  baseBridgeAssetAddress: `0x${string}`;
  arbBridgeAssetAddress: `0x${string}`;
  autoReportNav: boolean;
  performanceFeeBps: number;
  totalShares: string;
  sharePriceE18: string;
  totalAssetsEthWei: string;
  liquidEthWei: string;
  reserveEthWei: string;
  pendingBridgeEthWei: string;
  hlStrategyEthWei: string;
  accruedFeesEthWei: string;
  routerPendingEthWei: string;
  reserveManagedEthWei: string;
  arbEscrowBridgeAssetRaw: string;
  strategyBridgeAssetRaw: string;
  targetLiquidBps: number;
  targetReserveBps: number;
  targetHlBps: number;
  navLastReportedAt: number;
  navMinIntervalMs: number;
  lastNavTimestamp: number;
  lastNavHash: `0x${string}`;
  paused: boolean;
  account: VaultRailAccountSnapshot | null;
}

interface ParallelRunnerEntry {
  runnerId: string;
  label: string;
  performance: TraderPerformanceReport;
}

interface MetricsResponse {
  performance?: TraderPerformanceReport;
  parallel?: ParallelRunnerEntry[];
  vault?: VaultOverview | null;
  vaultRails?: VaultRailOverview[];
  access?: {
    operator: boolean;
    holder?: boolean;
    fullAccess?: boolean;
    via?: string | null;
    accountMatched?: boolean;
  };
  error?: string;
}

interface SubscriptionSplit {
  key: "vault" | "lp";
  recipient: Address;
  requiredWei: string;
  requiredMo: string;
  paidWei: string;
  paidMo: string;
  remainingWei: string;
  remainingMo: string;
}

interface SubscriptionStatus {
  enabled: boolean;
  accessMode?: "holder-balance";
  chainId: number;
  monthKey: string;
  requiredMoBalance?: string;
  requiredWeiBalance?: string;
  monthlyFeeMo: string;
  monthlyFeeWei: string;
  splits: SubscriptionSplit[];
  account?: {
    address: Address;
    unlocked: boolean;
    balanceWei?: string;
    balanceMo?: string;
    paidWeiTotal: string;
    paidMoTotal: string;
    txHashes: string[];
  };
  freeAccess?: {
    monthKey: string;
    limit: number;
    used: number;
    remaining: number;
  };
  fullAccess?: boolean;
  holderVerified?: boolean;
  operator?: boolean;
  session?: {
    authenticated: boolean;
    address: Address | null;
    matchesAccount: boolean;
  };
  reason?: string;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  // Adaptive decimals: more precision for smaller values
  const decimals = abs === 0 ? 2 : abs < 0.01 ? 6 : abs < 1 ? 4 : abs < 100 ? 2 : 2;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  const pct = value * 100;
  const abs = Math.abs(pct);
  const decimals = abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(decimals)}%`;
}

function formatHoldDuration(openedAt: number, closedAt?: number): string {
  if (!closedAt) return "--";
  const ms = closedAt - openedAt;
  if (ms < 0) return "--";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSignedPctBps(value: string): string {
  try {
    const bps = Number(value);
    if (!Number.isFinite(bps)) return "--";
    return `${(bps / 100).toFixed(2)}%`;
  } catch {
    return "--";
  }
}

function formatUnsignedPctBps(value: string | number): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "--";
  return `${(numeric / 100).toFixed(2)}%`;
}

function trimDecimal(raw: string, maxFractionDigits = 4): string {
  if (!raw.includes(".")) return raw;
  const [whole, frac] = raw.split(".");
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

function quoteVaultRailSharesForAssets(
  assetsWei: bigint,
  totalAssetsWei: bigint,
  totalShares: bigint
): bigint {
  const virtualShares = BigInt(1000);
  const virtualAssets = BigInt(1000);
  const numerator = assetsWei * (totalShares + virtualShares);
  const denominator = totalAssetsWei + virtualAssets;
  if (denominator === BigInt(0)) return BigInt(0);
  return (numerator + denominator - BigInt(1)) / denominator;
}

function formatEthFromWei(value: string | null | undefined): string {
  if (!value) return "--";
  try {
    const asWei = BigInt(value);
    const isNegative = asWei < BigInt(0);
    const absolute = isNegative ? -asWei : asWei;
    const base = trimDecimal(formatEther(absolute), 5);
    return `${isNegative ? "-" : ""}${base} ETH`;
  } catch {
    return "--";
  }
}

function parseWeiOrZero(value: string | null | undefined): bigint {
  if (!value) return BigInt(0);
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

function shortHex(value: string): string {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function fundingChainIdForVenue(
  venue: "base-spot" | "ethereum-spot" | "hyperliquid-perp"
): number {
  return venue === "ethereum-spot" ? 1 : 8453;
}

function chainLabel(chainId: number): string {
  switch (chainId) {
    case 1:
      return "Ethereum mainnet";
    case 8453:
      return "Base mainnet";
    case 84532:
      return "Base Sepolia";
    default:
      return `chain ${chainId}`;
  }
}

/** Well-known token addresses → human-readable symbols (lowercased keys). */
const KNOWN_TOKENS: Record<string, string> = {
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "USDbC",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": "cbETH",
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": "wstETH",
  "0x8729c70061739140ee6be00a3875cbf6d09a746c": "MO",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
  "0x6982508145454ce325ddbe47a25d4ec3d2311933": "PEPE",
  "0xaaee1a9723aadb7afa2810263653a34ba2c21c7a": "MOG",
  "0xd07379a755a8f11b57610154861d694b2a0f615a": "BASE",
};

function venueLabel(venue?: Position["venue"]): string {
  switch (venue) {
    case "hyperliquid-perp": return "HL";
    case "ethereum-spot":    return "ETH";
    case "base-spot":        return "BASE";
    default:                 return "BASE";
  }
}

function symbolForPosition(position: Position): string {
  if (position.marketSymbol) return position.marketSymbol;
  return KNOWN_TOKENS[position.tokenAddress.toLowerCase()] ?? shortHex(position.tokenAddress);
}

function pnlClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "text-[var(--ink-faint)]";
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-[var(--ink-faint)]";
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "--";
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function RationalePanel({ position }: { position: Position }) {
  const er = position.entryRationale;
  const xr = position.exitRationale;
  const hasSomething = er || xr || position.signalSource || position.moralScore;
  if (!hasSomething) {
    return (
      <div className="px-3 py-2 bg-[var(--paper-tint)] font-mono text-[9px] text-[var(--ink-faint)]">
        No rationale recorded for this trade (opened before tracking was enabled).
      </div>
    );
  }

  return (
    <div className="px-3 py-2 bg-[var(--paper-tint)] border-t border-[var(--rule-light)] font-mono text-[9px] leading-relaxed">
      {er && (
        <div className="mb-1">
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Entry: </span>
          {er.signalSymbol && (
            <span className="text-[var(--ink-light)]">
              {er.signalSymbol} {er.signalDirection} (score {er.signalScore?.toFixed(2) ?? "?"}, {er.signalObservations ?? 0} sources
              {er.contradictionPenalty != null && er.contradictionPenalty > 0
                ? `, ${(er.contradictionPenalty * 100).toFixed(0)}% contradiction`
                : ", unanimous"}
              )
            </span>
          )}
          {er.kellyPhase && (
            <span className="text-[var(--ink-faint)] ml-1">
              | Kelly: {er.kellyPhase} ${er.kellySizeUsd?.toFixed(0) ?? "?"}
              {er.actualSizeUsd && er.kellySizeUsd && Math.abs(er.actualSizeUsd - er.kellySizeUsd) > 1
                ? ` → $${er.actualSizeUsd.toFixed(0)} (capped)`
                : ""}
            </span>
          )}
          {er.supportingClaims && er.supportingClaims.length > 0 && (
            <div className="mt-0.5 text-[var(--ink-faint)] pl-2">
              {er.supportingClaims.map((c, i) => (
                <div key={i}>— {c}</div>
              ))}
            </div>
          )}
          {er.skippedSignals && er.skippedSignals.length > 0 && (
            <div className="mt-0.5 text-[var(--ink-faint)] pl-2">
              Skipped: {er.skippedSignals.join(", ")}
            </div>
          )}
        </div>
      )}
      {er?.compositeDirection && (
        <div className="mb-1">
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Composite: </span>
          <span className={er.compositeDirection === "long" ? "text-emerald-700" : er.compositeDirection === "short" ? "text-red-700" : "text-[var(--ink-faint)]"}>
            {er.compositeDirection.toUpperCase()}
          </span>
          <span className="text-[var(--ink-faint)]"> conf={((er.compositeConfidence ?? 0) * 100).toFixed(0)}%</span>
          {er.agreementMet != null && (
            <span className={er.agreementMet ? "text-emerald-700" : "text-red-700"}>
              {" "}| {er.agreementMet ? "2/3 agree" : "no agreement"}
            </span>
          )}
          <div className="mt-0.5 pl-2 text-[var(--ink-faint)]">
            {er.technicalDirection && (
              <span className="mr-2">Tech: <span className={er.technicalDirection === "long" ? "text-emerald-700" : er.technicalDirection === "short" ? "text-red-700" : ""}>{er.technicalDirection}</span>{er.technicalStrength != null ? ` (${(er.technicalStrength * 100).toFixed(0)}%)` : ""}</span>
            )}
            {er.patternDirection && (
              <span className="mr-2">Pattern: <span className={er.patternDirection === "long" ? "text-emerald-700" : er.patternDirection === "short" ? "text-red-700" : ""}>{er.patternDirection}</span>{er.patternNames?.length ? ` [${er.patternNames.join(", ")}]` : ""}</span>
            )}
            {er.signalDirection && (
              <span>News: <span className={er.signalDirection === "bullish" ? "text-emerald-700" : er.signalDirection === "bearish" ? "text-red-700" : ""}>{er.signalDirection}</span></span>
            )}
          </div>
          {er.compositeReasons && er.compositeReasons.length > 0 && (
            <div className="mt-0.5 pl-2 text-[var(--ink-faint)]">
              {er.compositeReasons.map((r, i) => (
                <div key={i}>— {r}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {!er && position.signalSource && (
        <div className="mb-1">
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Signal: </span>
          <span className="text-[var(--ink-light)]">{position.signalSource}</span>
          {position.signalConfidence != null && (
            <span className="text-[var(--ink-faint)]"> (confidence {(Math.min(position.signalConfidence, 1) * 100).toFixed(0)}%)</span>
          )}
        </div>
      )}
      {position.moralScore != null && (
        <div className="mb-1">
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Moral: </span>
          <span className="text-[var(--ink-light)]">{position.moralScore}/100</span>
          {position.moralJustification && (
            <span className="text-[var(--ink-faint)] ml-1">— {position.moralJustification}</span>
          )}
        </div>
      )}
      {position.kellyFraction != null && (
        <div className="mb-1">
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Kelly f: </span>
          <span className="text-[var(--ink-light)]">{(position.kellyFraction * 100).toFixed(1)}%</span>
        </div>
      )}
      {xr && (
        <div>
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Exit: </span>
          <span className="text-[var(--ink-light)]">{xr.trigger}</span>
          {xr.highWaterMark != null && (
            <span className="text-[var(--ink-faint)]"> | HWM ${xr.highWaterMark.toFixed(4)}</span>
          )}
          {xr.drawdownFromPeak != null && (
            <span className="text-red-700"> | -{(xr.drawdownFromPeak * 100).toFixed(1)}% from peak</span>
          )}
          {xr.holdDurationMs != null && (
            <span className="text-[var(--ink-faint)]"> | held {formatDuration(xr.holdDurationMs)}</span>
          )}
        </div>
      )}
      {!xr && position.exitReason && (
        <div>
          <span className="font-bold text-[var(--ink)] uppercase tracking-wider">Exit: </span>
          <span className="text-[var(--ink-light)]">{position.exitReason}</span>
        </div>
      )}
    </div>
  );
}

function pnlWeiClass(value: string): string {
  try {
    const parsed = BigInt(value);
    if (parsed > BigInt(0)) return "text-emerald-700";
    if (parsed < BigInt(0)) return "text-red-700";
    return "text-[var(--ink-faint)]";
  } catch {
    return "text-[var(--ink-faint)]";
  }
}

const CHAIN_EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  42161: "https://arbiscan.io",
  421614: "https://sepolia.arbiscan.io",
  10: "https://optimistic.etherscan.io",
};

function txExplorerUrl(chainId: number, txHash: string): string {
  const base = CHAIN_EXPLORERS[chainId] ?? "https://basescan.org";
  return `${base}/tx/${txHash}`;
}

function sortFundersByEquity(
  funders: VaultFunderSnapshot[]
): VaultFunderSnapshot[] {
  return funders.slice().sort((a, b) => {
    try {
      const diff = BigInt(b.equityWei) - BigInt(a.equityWei);
      if (diff > BigInt(0)) return 1;
      if (diff < BigInt(0)) return -1;
      return 0;
    } catch {
      return 0;
    }
  });
}

function normalizeAmountInput(value: string): string {
  const trimmed = value.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Amount must be a numeric value");
  }
  if (Number(trimmed) <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  return trimmed;
}

export function AgentMarketDashboard() {
  const { address: connectedAddress } = useAccount();
  const connectedChainId = useChainId();

  const [data, setData] = useState<TraderPerformanceReport | null>(null);
  const [parallelRunners, setParallelRunners] = useState<ParallelRunnerEntry[]>([]);
  const [vault, setVault] = useState<VaultOverview | null>(null);
  const [vaultRails, setVaultRails] = useState<VaultRailOverview[]>([]);
  const [metricsAccess, setMetricsAccess] = useState<MetricsResponse["access"] | null>(null);
  const [ethPriceUsd, setEthPriceUsd] = useState<number>(0);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closedPage, setClosedPage] = useState(0);
  const [pnlTimeFilter, setPnlTimeFilter] = useState<"5m" | "15m" | "1h" | "4h" | "1d" | "7d" | "all">("all");
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("0.01");
  const [withdrawAmount, setWithdrawAmount] = useState("0.01");
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();
  const [lastTxChainId, setLastTxChainId] = useState<number>(8453);

  const {
    sendTransactionAsync,
    isPending: isDirectFundingPending,
    error: directFundingError,
  } = useSendTransaction();
  const {
    writeContractAsync,
    isPending: isVaultWritePending,
    error: vaultWriteError,
  } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { isLoading: isTxConfirming, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({
      hash: lastTxHash,
    });

  const refresh = useCallback(async () => {
    try {
      const query = connectedAddress ? `?account=${connectedAddress}` : "";
      const [metricsRes, marketsRes] = await Promise.all([
        fetch(`/api/trading/metrics${query}`, { cache: "no-store" }),
        fetch("/api/markets", { cache: "no-store" }),
      ]);
      const payload = (await metricsRes.json()) as MetricsResponse;
      if (!metricsRes.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${metricsRes.status}`);
      }
      if (!payload.performance) {
        throw new Error("Missing performance payload");
      }

      setData(payload.performance);
      setParallelRunners(payload.parallel ?? []);
      setVault(payload.vault ?? null);
      setVaultRails(payload.vaultRails ?? []);
      setMetricsAccess(payload.access ?? { operator: false, holder: false, fullAccess: false });

      // Extract ETH/USD price for vault conversion
      try {
        const markets = await marketsRes.json();
        const ethUsd = markets?.coingecko?.ethereum?.usd;
        if (typeof ethUsd === "number" && ethUsd > 0) {
          setEthPriceUsd(ethUsd);
        }
      } catch { /* markets price fetch failed — keep previous value */ }

      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load market metrics"
      );
    } finally {
      setLoading(false);
    }
  }, [connectedAddress]);

  const refreshSubscription = useCallback(async () => {
    try {
      const query = connectedAddress ? `?address=${connectedAddress}` : "";
      const response = await fetch(`/api/terminal/subscription/status${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as SubscriptionStatus & {
        error?: string;
      };
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setSubscription(payload);
    } catch {
      // non-blocking for the rest of dashboard
    }
  }, [connectedAddress]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    refreshSubscription();
    const interval = setInterval(refreshSubscription, 30_000);
    return () => clearInterval(interval);
  }, [refreshSubscription]);

  const activeVaultRail = useMemo(() => vaultRails[0] ?? null, [vaultRails]);
  const feePct = useMemo(() => {
    if (activeVaultRail?.enabled) return activeVaultRail.performanceFeeBps / 100;
    if (vault?.enabled) return vault.performanceFeeBps / 100;
    if (!data) return 5;
    return data.performanceFeeBps / 100;
  }, [activeVaultRail, data, vault]);

  const funderRows = useMemo(
    () => (vault?.funders ? sortFundersByEquity(vault.funders) : []),
    [vault]
  );
  const isOperatorView = metricsAccess?.operator === true;
  const hasFullMarketAccess = metricsAccess?.fullAccess === true;

  // ── Merge parallel runner positions into unified views ──────────────
  // All positions from all runners (primary + parallel) in one table.
  const allOpen = useMemo(() => {
    if (!data) return [];
    const combined = [...data.open];
    for (const runner of parallelRunners) {
      combined.push(...runner.performance.open);
    }
    return combined;
  }, [data, parallelRunners]);

  const allClosed = useMemo(() => {
    if (!data) return [];
    const combined = [...data.closed];
    for (const runner of parallelRunners) {
      combined.push(...runner.performance.closed);
    }
    // Sort by most recently closed first
    return combined.sort((a, b) => (b.position.closedAt ?? 0) - (a.position.closedAt ?? 0));
  }, [data, parallelRunners]);

  // Combined totals across all runners
  const combinedTotals = useMemo((): PerformanceTotals | undefined => {
    if (!data) return undefined;
    const base = { ...data.totals };
    for (const runner of parallelRunners) {
      const t = runner.performance.totals;
      base.openPositions += t.openPositions;
      base.closedPositions += t.closedPositions;
      base.unrealizedPnlUsd += t.unrealizedPnlUsd;
      base.realizedPnlUsd += t.realizedPnlUsd;
      base.grossPnlUsd += t.grossPnlUsd;
      base.deployedUsd += t.deployedUsd;
      base.netPnlAfterFeeUsd += t.netPnlAfterFeeUsd;
      base.performanceFeeUsd += t.performanceFeeUsd;
      base.estimatedTradingFeesUsd =
        (base.estimatedTradingFeesUsd ?? 0) + (t.estimatedTradingFeesUsd ?? 0);
    }
    return base;
  }, [data, parallelRunners]);

  // ── PnL time filter ──
  const pnlCutoff = useMemo(() => {
    if (pnlTimeFilter === "all") return 0;
    const ms: Record<string, number> = {
      "5m": 5 * 60e3, "15m": 15 * 60e3, "1h": 3600e3,
      "4h": 4 * 3600e3, "1d": 86400e3, "7d": 7 * 86400e3,
    };
    return Date.now() - (ms[pnlTimeFilter] ?? 0);
  }, [pnlTimeFilter]);

  const filteredOpen = useMemo(
    () => (pnlCutoff === 0 ? allOpen : allOpen.filter((r) => r.position.openedAt >= pnlCutoff)),
    [allOpen, pnlCutoff],
  );

  const filteredClosed = useMemo(
    () => (pnlCutoff === 0 ? allClosed : allClosed.filter((r) => (r.position.closedAt ?? 0) >= pnlCutoff)),
    [allClosed, pnlCutoff],
  );

  const filteredTotals = useMemo((): PerformanceTotals | undefined => {
    if (!combinedTotals) return undefined;
    if (pnlCutoff === 0) return combinedTotals;

    let unrealizedPnlUsd = 0;
    let realizedPnlUsd = 0;
    let estimatedTradingFeesUsd = 0;

    for (const r of filteredOpen) {
      unrealizedPnlUsd += r.unrealizedPnlUsd ?? 0;
      estimatedTradingFeesUsd += r.estimatedFeesUsd ?? 0;
    }
    for (const r of filteredClosed) {
      realizedPnlUsd += r.realizedPnlUsd ?? 0;
      estimatedTradingFeesUsd += r.estimatedFeesUsd ?? 0;
    }

    const grossPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const feeBps = data?.performanceFeeBps ?? 500;
    const performanceFeeUsd = realizedPnlUsd > 0 ? (realizedPnlUsd * feeBps) / 10_000 : 0;
    const netPnlAfterFeeUsd = grossPnlUsd - performanceFeeUsd;

    return {
      ...combinedTotals,
      openPositions: filteredOpen.length,
      closedPositions: filteredClosed.length,
      unrealizedPnlUsd,
      realizedPnlUsd,
      grossPnlUsd,
      estimatedTradingFeesUsd,
      performanceFeeUsd,
      netPnlAfterFeeUsd,
    };
  }, [combinedTotals, filteredOpen, filteredClosed, pnlCutoff, data?.performanceFeeBps]);

  // Active venue labels for display
  const activeVenues = useMemo(() => {
    if (!data) return "";
    const venues = [data.executionVenue];
    for (const runner of parallelRunners) {
      const v = runner.performance.executionVenue;
      if (!venues.includes(v)) venues.push(v);
    }
    return venues.join(" + ");
  }, [data, parallelRunners]);

  // Use a type guard so TS narrows `vault` in branches checking `isVaultEnabled`
  const isVaultEnabled = vault?.enabled === true;
  const safeVault = isVaultEnabled ? vault : null;
  const isVaultRailEnabled = activeVaultRail?.enabled === true;
  const isActionPending =
    isDirectFundingPending || isVaultWritePending || isTxConfirming;

  const submitVaultDeposit = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!vault || !isVaultEnabled) {
          throw new Error("Vault mode is not enabled");
        }
        if (!connectedAddress) {
          throw new Error("Connect wallet to deposit");
        }
        const amount = normalizeAmountInput(amountRaw);
        setDepositAmount(amount);

        // Auto-switch chain if wallet is on the wrong network
        if (connectedChainId !== vault.chainId) {
          await switchChainAsync({ chainId: vault.chainId });
        }

        const txHash = await writeContractAsync({
          address: vault.address,
          abi: AGENT_VAULT_ABI,
          functionName: "deposit",
          value: parseEther(amount),
          chainId: vault.chainId,
        });

        setLastTxHash(txHash);
        setLastTxChainId(vault.chainId);
        setTimeout(() => {
          refresh().catch(() => {
            // ignored, polling fallback covers this
          });
        }, 2_000);

        return `Deposit submitted: ${shortHex(txHash)}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deposit failed";
        setActionError(message);
        throw new Error(message);
      }
    },
    [connectedAddress, connectedChainId, isVaultEnabled, refresh, switchChainAsync, vault, writeContractAsync]
  );

  const submitVaultRailDeposit = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!activeVaultRail) {
          throw new Error("Vault rail is not enabled");
        }
        if (!connectedAddress) {
          throw new Error("Connect wallet to deposit");
        }
        const amount = normalizeAmountInput(amountRaw);
        setDepositAmount(amount);

        if (connectedChainId !== activeVaultRail.baseChainId) {
          await switchChainAsync({ chainId: activeVaultRail.baseChainId });
        }

        const txHash = await writeContractAsync({
          address: activeVaultRail.baseVaultAddress,
          abi: BASE_CAPITAL_VAULT_ABI,
          functionName: "depositETH",
          args: [connectedAddress],
          value: parseEther(amount),
          chainId: activeVaultRail.baseChainId,
        });

        setLastTxHash(txHash);
        setLastTxChainId(activeVaultRail.baseChainId);
        setTimeout(() => {
          refresh().catch(() => {
            // ignored, polling fallback covers this
          });
        }, 2_000);

        return `Vault rail deposit submitted: ${shortHex(txHash)}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deposit failed";
        setActionError(message);
        throw new Error(message);
      }
    },
    [activeVaultRail, connectedAddress, connectedChainId, refresh, switchChainAsync, writeContractAsync]
  );

  const submitVaultWithdraw = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!vault || !isVaultEnabled) {
          throw new Error("Vault mode is not enabled");
        }
        if (!connectedAddress) {
          throw new Error("Connect wallet to withdraw");
        }
        const amount = normalizeAmountInput(amountRaw);
        setWithdrawAmount(amount);

        // Auto-switch chain if wallet is on the wrong network
        if (connectedChainId !== vault.chainId) {
          await switchChainAsync({ chainId: vault.chainId });
        }

        const txHash = await writeContractAsync({
          address: vault.address,
          abi: AGENT_VAULT_ABI,
          functionName: "withdraw",
          args: [parseEther(amount)],
          chainId: vault.chainId,
        });

        setLastTxHash(txHash);
        setLastTxChainId(vault.chainId);
        setTimeout(() => {
          refresh().catch(() => {
            // ignored, polling fallback covers this
          });
        }, 2_000);

        return `Withdrawal submitted: ${shortHex(txHash)}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdraw failed";
        setActionError(message);
        throw new Error(message);
      }
    },
    [connectedAddress, connectedChainId, isVaultEnabled, refresh, switchChainAsync, vault, writeContractAsync]
  );

  const submitVaultRailWithdraw = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!activeVaultRail) {
          throw new Error("Vault rail is not enabled");
        }
        if (!connectedAddress) {
          throw new Error("Connect wallet to request a withdrawal");
        }
        const amount = normalizeAmountInput(amountRaw);
        setWithdrawAmount(amount);

        const totalAssetsWei = parseWeiOrZero(activeVaultRail.totalAssetsEthWei);
        const totalShares = parseWeiOrZero(activeVaultRail.totalShares);
        const assetsWei = parseEther(amount);
        const shares = quoteVaultRailSharesForAssets(assetsWei, totalAssetsWei, totalShares);
        if (shares <= BigInt(0)) {
          throw new Error("Requested withdrawal is too small");
        }
        if (
          activeVaultRail.account &&
          parseWeiOrZero(activeVaultRail.account.shares) > BigInt(0) &&
          shares > parseWeiOrZero(activeVaultRail.account.shares)
        ) {
          throw new Error("Requested withdrawal exceeds your current vault rail shares");
        }

        if (connectedChainId !== activeVaultRail.baseChainId) {
          await switchChainAsync({ chainId: activeVaultRail.baseChainId });
        }

        const txHash = await writeContractAsync({
          address: activeVaultRail.baseVaultAddress,
          abi: BASE_CAPITAL_VAULT_ABI,
          functionName: "requestWithdraw",
          args: [shares, connectedAddress],
          chainId: activeVaultRail.baseChainId,
        });

        setLastTxHash(txHash);
        setLastTxChainId(activeVaultRail.baseChainId);
        setTimeout(() => {
          refresh().catch(() => {
            // ignored, polling fallback covers this
          });
        }, 2_000);

        return `Vault rail withdrawal request submitted: ${shortHex(txHash)}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Withdrawal failed";
        setActionError(message);
        throw new Error(message);
      }
    },
    [activeVaultRail, connectedAddress, connectedChainId, refresh, switchChainAsync, writeContractAsync]
  );

  const submitDirectFund = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!data) {
          throw new Error("Funding destination unavailable");
        }
        if (!data.fundingAddress) {
          throw new Error("Direct funding is restricted to verified 100k MO holders");
        }
        const expectedChainId = fundingChainIdForVenue(data.executionVenue);
        if (connectedChainId !== expectedChainId) {
          throw new Error(
            `Switch wallet network to ${chainLabel(expectedChainId)} before sending funds`
          );
        }
        const amount = normalizeAmountInput(amountRaw);
        setDepositAmount(amount);

        const txHash = await sendTransactionAsync({
          to: data.fundingAddress,
          value: parseEther(amount),
          chainId: expectedChainId,
        });

        setLastTxHash(txHash);
        setLastTxChainId(expectedChainId);
        setTimeout(() => {
          refresh().catch(() => {
            // ignored, polling fallback covers this
          });
        }, 2_000);

        return `Funding transaction submitted: ${shortHex(txHash)}`;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Funding transaction failed";
        setActionError(message);
        throw new Error(message);
      }
    },
    [connectedChainId, data, refresh, sendTransactionAsync]
  );

  const handleDeposit = useCallback(async () => {
    try {
      if (isVaultRailEnabled) {
        await submitVaultRailDeposit(depositAmount);
        return;
      }
      if (isVaultEnabled) {
        await submitVaultDeposit(depositAmount);
        return;
      }
      await submitDirectFund(depositAmount);
    } catch {
      // errors are already pushed into actionError by submit helpers
    }
  }, [depositAmount, isVaultEnabled, isVaultRailEnabled, submitDirectFund, submitVaultDeposit, submitVaultRailDeposit]);

  const handleWithdraw = useCallback(async () => {
    try {
      if (isVaultRailEnabled) {
        await submitVaultRailWithdraw(withdrawAmount);
        return;
      }
      await submitVaultWithdraw(withdrawAmount);
    } catch {
      // errors are already pushed into actionError by submit helpers
    }
  }, [isVaultRailEnabled, submitVaultRailWithdraw, submitVaultWithdraw, withdrawAmount]);

  const handleUnlockPlan = useCallback(async (): Promise<string> => {
    if (!connectedAddress) {
      throw new Error("Connect a wallet holding 100,000 MO for full terminal access");
    }

    const query = new URLSearchParams({
      address: connectedAddress,
      refresh: "1",
    });
    const statusRes = await fetch(`/api/terminal/subscription/status?${query.toString()}`, {
      cache: "no-store",
    });
    const liveSubscription = (await statusRes.json().catch(() => null)) as SubscriptionStatus | null;
    if (statusRes.ok && liveSubscription) {
      setSubscription(liveSubscription);
    }
    const effectiveSubscription = statusRes.ok && liveSubscription ? liveSubscription : subscription;

    const requiredBalance = effectiveSubscription?.requiredMoBalance || "100000";
    const currentBalance = effectiveSubscription?.account?.balanceMo;
    const walletQualifies = effectiveSubscription?.account?.unlocked === true;
    const sessionMatchesWallet = effectiveSubscription?.session?.matchesAccount === true;

    if (!walletQualifies) {
      return currentBalance
        ? `Current wallet balance: ${currentBalance} MO. Hold ${requiredBalance} MO for full terminal access.`
        : `Hold ${requiredBalance} MO in the connected wallet for full terminal access.`;
    }

    if (effectiveSubscription?.fullAccess && sessionMatchesWallet) {
      return `${currentBalance || requiredBalance} MO holder verified. Full terminal access is already unlocked.`;
    }

    const nonceRes = await fetch("/api/auth/nonce", {
      method: "GET",
      cache: "no-store",
    });
    const noncePayload = (await nonceRes.json().catch(() => ({}))) as {
      nonce?: string;
      error?: string;
    };
    if (!nonceRes.ok || !noncePayload.nonce) {
      throw new Error(noncePayload.error || "Failed to prepare wallet verification");
    }

    const chainId = connectedChainId || 1;
    const message = new SiweMessage({
      domain: window.location.host,
      address: connectedAddress,
      statement: "Verify wallet ownership to unlock pooter world holder access.",
      uri: window.location.origin,
      version: "1",
      chainId,
      nonce: noncePayload.nonce,
    }).prepareMessage();

    const signature = await signMessageAsync({ message });
    const verifyRes = await fetch("/api/auth/siwe-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    const verifyPayload = (await verifyRes.json().catch(() => ({}))) as {
      error?: string;
      debug?: { domainMatch?: boolean; nonceMatch?: boolean; expectedDomain?: string; messageDomain?: string };
    };
    if (!verifyRes.ok) {
      const dbg = verifyPayload.debug;
      const detail = dbg
        ? ` [domain=${dbg.expectedDomain}→${dbg.messageDomain} match=${dbg.domainMatch}, nonce=${dbg.nonceMatch}]`
        : "";
      throw new Error((verifyPayload.error || "Wallet verification failed") + detail);
    }

    await Promise.all([refreshSubscription(), refresh()]);
    return `${requiredBalance} MO holder verified. Full terminal access unlocked for ${shortHex(connectedAddress)}.`;
  }, [
    connectedAddress,
    connectedChainId,
    refresh,
    refreshSubscription,
    signMessageAsync,
    subscription?.account?.balanceMo,
    subscription?.account?.unlocked,
    subscription?.fullAccess,
    subscription?.requiredMoBalance,
    subscription?.session?.matchesAccount,
  ]);

  if (loading && !data) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Loading market telemetry...
      </p>
    );
  }

  if (!data) {
    return (
      <div className="border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-red)]">
          Market dashboard unavailable
        </p>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-faint)]">
          {error ?? "Unknown error"}
        </p>
      </div>
    );
  }

  const balances = hasFullMarketAccess ? data.readiness.balances.slice(0, 6) : [];
  const CLOSED_PAGE_SIZE = 15;
  const subscriptionUnlocked = subscription?.fullAccess === true;
  const holderWalletQualified = subscription?.account?.unlocked === true;
  const railFundingChainId = activeVaultRail?.baseChainId ?? null;
  const expectedFundingChainId = railFundingChainId ?? fundingChainIdForVenue(data.executionVenue);
  const vaultAumWei = safeVault ? parseWeiOrZero(safeVault.totalManagedAssetsWei) : BigInt(0);
  const vaultDeployedWei = safeVault ? parseWeiOrZero(safeVault.deployedCapitalWei) : BigInt(0);
  const vaultIdle = isVaultEnabled && vaultDeployedWei === BigInt(0);
  const vaultAumLabel = safeVault ? formatEthFromWei(safeVault.totalManagedAssetsWei) : "--";
  const vaultDeployedLabel = safeVault ? formatEthFromWei(safeVault.deployedCapitalWei) : "--";
  const railLiquidWei = activeVaultRail ? parseWeiOrZero(activeVaultRail.liquidEthWei) : BigInt(0);
  const railReserveWei = activeVaultRail ? parseWeiOrZero(activeVaultRail.reserveEthWei) : BigInt(0);
  const railPendingWei = activeVaultRail ? parseWeiOrZero(activeVaultRail.pendingBridgeEthWei) : BigInt(0);
  const railStrategyWei = activeVaultRail ? parseWeiOrZero(activeVaultRail.hlStrategyEthWei) : BigInt(0);
  const railIdle = activeVaultRail ? railReserveWei === BigInt(0) && railPendingWei === BigInt(0) && railStrategyWei === BigInt(0) : false;
  const railDeployedWei = railReserveWei + railPendingWei + railStrategyWei;
  const railAumLabel = activeVaultRail ? formatEthFromWei(activeVaultRail.totalAssetsEthWei) : "--";
  const railDeployedLabel = activeVaultRail ? formatEthFromWei(railDeployedWei.toString()) : "--";
  const railLastReportLabel = activeVaultRail?.navLastReportedAt
    ? new Date(activeVaultRail.navLastReportedAt * 1000).toLocaleString()
    : "Never";
  const railNavSettlementLabel = activeVaultRail?.lastNavTimestamp
    ? new Date(activeVaultRail.lastNavTimestamp * 1000).toLocaleString()
    : "Never";
  const baseParallelRunner = parallelRunners.find(
    (runner) => runner.performance.executionVenue === "base-spot"
  );
  const baseParallelOpenPositions = baseParallelRunner?.performance.totals.openPositions ?? 0;
  const fundingFacts = isVaultRailEnabled
    ? [
        "Deposit mints BaseCapitalVault shares to your wallet on Base, so your ownership stays onchain by address.",
        "Capital is bucketed across liquid ETH, reserve yield, pending bridge, and the Hyperliquid strategy sleeve.",
        "BridgeRouter handles the Base -> Arbitrum transit leg before the HL strategy manager deploys capital into the trading account.",
        "Withdrawals come out of liquid ETH immediately when possible; otherwise they queue until bridge / strategy capital settles back.",
      ]
    : isVaultEnabled
    ? [
        "Deposit mints vault shares to your wallet, so your position is tracked by address.",
        "The ETH stays in the vault until the manager allocates capital out to a strategy wallet.",
        data.executionVenue === "hyperliquid-perp"
          ? "Vault deposits do not automatically become Hyperliquid margin. Hyperliquid only sees funds after a separate allocation and transfer flow."
          : `Vault deposits fund the pooled strategy on ${chainLabel(expectedFundingChainId)}, not a personal trading account.`,
        data.executionVenue === "hyperliquid-perp"
          ? "Today the Hyperliquid bot trades separate margin. Vault shares and Hyperliquid bankroll are still different systems."
          : "If the Base runner is enabled, deployed vault capital is what funds those spot positions.",
      ]
      : [
        `This sends native ETH directly to the agent funding wallet on ${chainLabel(expectedFundingChainId)}.`,
        "Direct-fund mode does not create shares, a per-user balance, or an onchain refund ledger for you.",
        data.executionVenue === "hyperliquid-perp"
          ? "Sending ETH here does not automatically top up Hyperliquid collateral. It only funds the bot wallet."
          : "This is a strategy wallet top-up, not a deposit into a personal account.",
        data.executionVenue === "hyperliquid-perp"
          ? "That means direct Hyperliquid funding is operator-controlled bankroll, not a vault share position."
          : "This does not buy you into a pooled vault share class.",
      ];
  const unlockSummary = subscription
    ? subscriptionUnlocked
      ? `${subscription.account?.balanceMo || subscription.requiredMoBalance || "100000"} MO holder verified`
      : holderWalletQualified
        ? subscription.session?.authenticated
          ? `Connected wallet qualifies — sign with this wallet to refresh full access`
          : `Wallet holds enough MO — verify this wallet to unlock full access`
      : subscription.account?.balanceMo
        ? `${subscription.account.balanceMo} MO held • ${subscription.requiredMoBalance || "100000"} MO required`
        : `Hold ${subscription.requiredMoBalance || "100000"} MO in the connected wallet for full access`
    : null;

  const isFlat = allOpen.length === 0;
  const lastTradeAge = allClosed.length > 0 && allClosed[0].position.closedAt
    ? Date.now() - allClosed[0].position.closedAt
    : Infinity;
  const isStale = lastTradeAge > 24 * 60 * 60 * 1000; // no trade in 24h

  return (
    <div className="space-y-6">
      {/* Honesty banner — show real state instead of looking dead */}
      {isFlat && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-tint)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink)]">
              {isStale ? "Awaiting Signal Consensus" : "Flat — No Open Positions"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[8px] tracking-[0.1em] text-[var(--ink-faint)]">
            {isStale
              ? "The composite signal pipeline requires 2+ sources to agree on direction before opening a position. Signals are being generated — waiting for consensus."
              : `Last trade closed ${allClosed.length > 0 ? new Date(allClosed[0].position.closedAt ?? 0).toLocaleString() : "unknown"}. Agent is scanning for the next opportunity.`}
          </p>
        </div>
      )}

      <section className="border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-2xl font-bold text-[var(--ink)]">
          Agent Markets
        </h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          Live agent performance, vault accounting, and terminal access.
        </p>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Venue: {activeVenues} | {data.dryRun ? "Dry Run" : "Live"} |
          Updated {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {isVaultRailEnabled ? "BaseCapitalVault" : "Base Vault"}
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            {isVaultRailEnabled
              ? `Rail-backed vault • ${chainLabel(activeVaultRail.baseChainId)}`
              : isVaultEnabled
                ? "Share-tracked pool"
                : "Vault not enabled"}
          </p>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? `AUM ${railAumLabel} with ${railDeployedLabel} allocated across reserve, bridge, and HL sleeves.`
              : isVaultEnabled
              ? `AUM ${vaultAumLabel} with ${vaultDeployedLabel} deployed.`
              : "This market view is not currently using the onchain vault flow."}
          </p>
          {isVaultRailEnabled ? (
            <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
              {railIdle
                ? "The rail is deployed and readable, but capital is still sitting entirely liquid on Base right now."
                : "The rail is active: some capital is already off the liquid Base bucket and tracked across reserve, bridge, or HL strategy sleeves."}
            </p>
          ) : isVaultEnabled ? (
            <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
              {vaultIdle
                ? "Right now none of the vault's capital is allocated out to a live strategy wallet, so deposits are sitting idle in the vault."
                : "Some vault capital is allocated out to a strategy wallet and is counted in deployed capital."}
            </p>
          ) : null}
        </div>

        <div className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {isVaultRailEnabled ? "Bridge & Settlement" : "Live Executor"}
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            {isVaultRailEnabled
              ? `${chainLabel(activeVaultRail.baseChainId)} -> ${chainLabel(activeVaultRail.arbChainId)} -> Hyperliquid`
              : data.executionVenue === "hyperliquid-perp" ? "Hyperliquid perp" : chainLabel(expectedFundingChainId)}
          </p>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? `BridgeRouter ${shortHex(activeVaultRail.bridgeRouterAddress)} settles into HL manager ${activeVaultRail.hlStrategyManagerAddress ? shortHex(activeVaultRail.hlStrategyManagerAddress) : "not configured"}.`
              : data.executionVenue === "hyperliquid-perp"
              ? `The live trader is the Hyperliquid account ${isOperatorView && data.account ? shortHex(data.account) : "behind operator access"}.`
              : `The active trader is using ${chainLabel(expectedFundingChainId)} spot execution.`}
          </p>
          <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? `Last NAV report: ${railLastReportLabel}. Last vault settlement: ${railNavSettlementLabel}.`
              : data.executionVenue === "hyperliquid-perp"
              ? combinedTotals?.openPositions
                ? `It currently has ${combinedTotals.openPositions} open position${combinedTotals.openPositions === 1 ? "" : "s"} and is live.`
                : "It is live and watching for entries right now, but currently flat with 0 open positions."
              : baseParallelRunner
                ? `Base parallel runner is enabled with ${baseParallelOpenPositions} open position${baseParallelOpenPositions === 1 ? "" : "s"}.`
                : "No separate Base launch-sniping runner is active right now."}
          </p>
        </div>

        <div className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Ownership Model
          </h2>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? "Deposits mint BaseCapitalVault shares, while bridge and HL deployment stay accounted for under the same share supply."
              : isVaultEnabled
              ? "Vault deposits mint onchain shares to your wallet on Base."
              : "Direct funding does not mint shares or track a personal balance for you."}
          </p>
          <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? "That means Base depositors still own the pooled capital even when it is parked in reserve yield, moving across the bridge, or deployed into the HL execution sleeve."
              : isVaultEnabled && data.executionVenue === "hyperliquid-perp"
              ? "Important: those Base vault shares do not automatically become Hyperliquid margin today. Hyperliquid bankroll is still a separate capital rail."
              : isVaultEnabled
                ? "If the vault deploys capital into a strategy wallet, your exposure is through vault shares rather than a personal trading account."
                : "If you fund the bot directly, that capital is operator-controlled strategy capital until a proper vault bridge/accounting rail exists."}
          </p>
        </div>
      </section>

      {/* PnL time filter */}
      <div className="flex items-center gap-1">
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)] mr-2">PnL Window</span>
        {(["5m", "15m", "1h", "4h", "1d", "7d", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setPnlTimeFilter(f); setClosedPage(0); }}
            className={`px-1.5 py-0.5 font-mono text-[9px] ${
              pnlTimeFilter === f
                ? "text-[var(--ink)] font-bold underline underline-offset-2"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Open PnL"
          value={formatUsd(filteredTotals?.unrealizedPnlUsd ?? 0)}
          valueClass={pnlClass(filteredTotals?.unrealizedPnlUsd ?? 0)}
        />
        <MetricCard
          label="Realized PnL"
          value={formatUsd(filteredTotals?.realizedPnlUsd ?? 0)}
          valueClass={pnlClass(filteredTotals?.realizedPnlUsd ?? 0)}
        />
        <MetricCard
          label="Gross PnL"
          value={formatUsd(filteredTotals?.grossPnlUsd ?? 0)}
          valueClass={pnlClass(filteredTotals?.grossPnlUsd ?? 0)}
        />
        <MetricCard
          label="Exch Fees (est)"
          value={`-${formatUsd(filteredTotals?.estimatedTradingFeesUsd ?? 0)}`}
          valueClass="text-[var(--accent-red)]"
        />
        <MetricCard
          label={`Perf Fee (${feePct.toFixed(1)}%)`}
          value={formatUsd(filteredTotals?.performanceFeeUsd ?? 0)}
        />
        <MetricCard
          label="Net PnL"
          value={formatUsd(filteredTotals?.netPnlAfterFeeUsd ?? 0)}
          valueClass={pnlClass(filteredTotals?.netPnlAfterFeeUsd ?? 0)}
        />
      </section>

      {isVaultRailEnabled ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard
            label="Rail AUM"
            value={formatEthFromWei(activeVaultRail.totalAssetsEthWei)}
          />
          <MetricCard
            label="Liquid ETH"
            value={formatEthFromWei(activeVaultRail.liquidEthWei)}
          />
          <MetricCard
            label="Reserve Bucket"
            value={formatEthFromWei(activeVaultRail.reserveEthWei)}
          />
          <MetricCard
            label="Pending Bridge"
            value={formatEthFromWei(activeVaultRail.pendingBridgeEthWei)}
          />
          <MetricCard
            label="HL Sleeve"
            value={formatEthFromWei(activeVaultRail.hlStrategyEthWei)}
          />
          <MetricCard
            label="Share Price"
            value={`${trimDecimal(formatEther(BigInt(activeVaultRail.sharePriceE18)), 6)} ETH`}
          />
        </section>
      ) : vault?.enabled ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Vault AUM"
            value={formatEthFromWei(vault.totalManagedAssetsWei)}
          />
          <MetricCard
            label="Liquid"
            value={formatEthFromWei(vault.liquidAssetsWei)}
          />
          <MetricCard
            label="Deployed"
            value={formatEthFromWei(vault.deployedCapitalWei)}
          />
          <MetricCard
            label="Fees Paid"
            value={formatEthFromWei(vault.totalFeesPaidWei)}
          />
        </section>
      ) : null}

      <section>
        <TradingChart height={340} watchMarkets={["BTC","ETH","SOL","HYPE","XRP","SUI","DOGE","LINK","AVAX","BNB","PAXG","TAO","ZEC","FET","TRUMP","BCH","WLD","AAVE","OP","ARB"]} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-[var(--rule-light)] p-4 lg:col-span-2">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Readiness & Balances
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            {data.readiness.liveReady ? "Live Ready" : "Gated"}
            {isOperatorView && data.account ? ` | ${shortHex(data.account)}` : ""}
          </p>

          {hasFullMarketAccess ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {balances.map((balance) => (
                <div
                  key={balance.symbol}
                  className="border border-[var(--rule-light)] p-2"
                >
                  <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                    {balance.symbol}
                  </p>
                  <p
                    className={`font-headline text-sm ${
                      balance.meetsRequirement
                        ? "text-[var(--ink)]"
                        : "text-red-700"
                    }`}
                  >
                    {balance.formatted}
                  </p>
                  {balance.requiredFormatted ? (
                    <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                      Min {balance.requiredFormatted}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 font-body-serif text-sm text-[var(--ink-faint)]">
              Detailed balances and live readiness checks unlock for verified 100k MO holders.
            </p>
          )}

          {data.readiness.reasons.length > 0 ? (
            <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--accent-red)]">
                Gating Reasons
              </p>
              <p className="mt-1 font-mono text-[9px] text-[var(--ink-light)]">
                {data.readiness.reasons.join(" | ")}
              </p>
            </div>
          ) : null}

          {data.executionVenue === "hyperliquid-perp" ? (
            <p className="mt-3 border-t border-[var(--rule-light)] pt-2 font-body-serif text-xs text-[var(--ink-light)]">
              Hyperliquid readiness is based on the Hyperliquid account value, not just ETH
              sitting in the Base wallet. Funding this page does not by itself guarantee live
              Hyperliquid buying power.
            </p>
          ) : null}
        </div>

        <div className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {isVaultRailEnabled ? "Fund Vault Rail" : isVaultEnabled ? "Fund Vault" : "Fund Agent"}
          </h2>
          <p className="mt-1 break-all font-mono text-[9px] text-[var(--ink-faint)]">
            {isVaultRailEnabled
              ? activeVaultRail.baseVaultAddress
              : isVaultEnabled
                ? vault!.address
              : data.fundingAddress ?? "Holder access required"}
          </p>
          <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
            {isVaultRailEnabled
              ? `Deposit ETH into BaseCapitalVault on ${chainLabel(activeVaultRail.baseChainId)}. Share accounting continues across reserve, bridge, and HL settlement. Performance fee target is ${(activeVaultRail.performanceFeeBps / 100).toFixed(
                  2
                )}%.`
              : isVaultEnabled
              ? `Deposit ETH into the vault and receive shares. Withdrawals are limited by liquid capital. Performance fee is ${feePct.toFixed(
                  2
                )}% on realized strategy profit.`
              : `Direct transfer to trading wallet fallback. Performance fee target is ${feePct.toFixed(
                  2
                )}% on realized profits.`}
          </p>
          <div className="mt-3 border border-[var(--rule-light)] bg-[var(--paper-dark)] p-3">
            <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              What This Actually Does
            </p>
            <ul className="mt-2 space-y-1 font-body-serif text-xs text-[var(--ink-light)]">
              {fundingFacts.map((fact) => (
                <li key={fact}>• {fact}</li>
              ))}
            </ul>
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--accent-red)]">
              Use {chainLabel(expectedFundingChainId)} for this flow.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                placeholder="0.01"
                className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
              />
              <button
                onClick={handleDeposit}
                disabled={isActionPending}
                className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                {isActionPending ? "Pending..." : isVaultRailEnabled || isVaultEnabled ? "Deposit" : "Fund"}
              </button>
            </div>

            {isVaultRailEnabled || isVaultEnabled ? (
              <div className="flex gap-2">
                <input
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="0.01"
                  className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
                />
                <button
                  onClick={handleWithdraw}
                  disabled={isActionPending}
                  className="border border-[var(--rule)] bg-[var(--paper)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)] disabled:opacity-50"
                >
                  {isActionPending ? "Pending..." : isVaultRailEnabled ? "Request Withdraw" : "Withdraw"}
                </button>
              </div>
            ) : null}
          </div>

          {lastTxHash ? (
            <a
              href={txExplorerUrl(lastTxChainId, lastTxHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)] underline"
            >
              View Transaction
            </a>
          ) : null}
          {txSuccess ? (
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-700">
              Transaction confirmed
            </p>
          ) : null}
          {directFundingError ? (
            <p className="mt-2 font-mono text-[8px] text-red-700">
              {directFundingError.message}
            </p>
          ) : null}
          {vaultWriteError ? (
            <p className="mt-2 font-mono text-[8px] text-red-700">
              {vaultWriteError.message}
            </p>
          ) : null}
          {actionError ? (
            <p className="mt-2 font-mono text-[8px] text-red-700">{actionError}</p>
          ) : null}
        </div>
      </section>

      {isVaultRailEnabled ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="border border-[var(--rule-light)] p-4 lg:col-span-1">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
              My Vault Rail Position
            </h2>
            {connectedAddress ? (
              activeVaultRail.account ? (
                <div className="mt-2 space-y-1 font-mono text-[10px] text-[var(--ink-light)]">
                  <p>Address: {shortHex(connectedAddress)}</p>
                  <p>Shares: {trimDecimal(formatEther(BigInt(activeVaultRail.account.shares)), 6)}</p>
                  <p>Claim Value: {formatEthFromWei(activeVaultRail.account.assetsEthWei)}</p>
                  <p>Share of Vault: {formatUnsignedPctBps(activeVaultRail.account.shareOfSupplyBps)}</p>
                  <p>NAV Report: {railLastReportLabel}</p>
                </div>
              ) : (
                <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                  No vault rail position yet.
                </p>
              )
            ) : (
              <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                Connect wallet to view your vault rail position.
              </p>
            )}
          </div>

          <div className="border border-[var(--rule-light)] p-4 lg:col-span-2">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
              Rail Topology
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="border border-[var(--rule-light)] p-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Contracts
                </p>
                <div className="mt-2 space-y-1 break-all font-mono text-[9px] text-[var(--ink-light)]">
                  <p>Vault: {activeVaultRail.baseVaultAddress}</p>
                  <p>BridgeRouter: {activeVaultRail.bridgeRouterAddress}</p>
                  <p>NavReporter: {activeVaultRail.navReporterAddress}</p>
                  {activeVaultRail.reserveAllocatorAddress ? (
                    <p>ReserveAllocator: {activeVaultRail.reserveAllocatorAddress}</p>
                  ) : null}
                  {activeVaultRail.hlStrategyManagerAddress ? (
                    <p>HLStrategyManager: {activeVaultRail.hlStrategyManagerAddress}</p>
                  ) : null}
                </div>
              </div>
              <div className="border border-[var(--rule-light)] p-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  Targets & Status
                </p>
                <div className="mt-2 space-y-1 font-mono text-[9px] text-[var(--ink-light)]">
                  <p>Liquid target: {formatUnsignedPctBps(activeVaultRail.targetLiquidBps)}</p>
                  <p>Reserve target: {formatUnsignedPctBps(activeVaultRail.targetReserveBps)}</p>
                  <p>HL target: {formatUnsignedPctBps(activeVaultRail.targetHlBps)}</p>
                  <p>Auto NAV: {activeVaultRail.autoReportNav ? "enabled" : "disabled"}</p>
                  <p>Min NAV interval: {Math.round(activeVaultRail.navMinIntervalMs / 60_000)} min</p>
                  <p>Status: {activeVaultRail.paused ? "paused" : "live"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : vault?.enabled ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="border border-[var(--rule-light)] p-4 lg:col-span-1">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
              My Vault Position
            </h2>
            {connectedAddress ? (
              vault.account ? (
                <div className="mt-2 space-y-1 font-mono text-[10px] text-[var(--ink-light)]">
                  <p>Address: {shortHex(connectedAddress)}</p>
                  <p>Shares: {vault.account.shares}</p>
                  <p>Equity: {formatEthFromWei(vault.account.equityWei)}</p>
                  <p>Deposited: {formatEthFromWei(vault.account.depositedWei)}</p>
                  <p>Withdrawn: {formatEthFromWei(vault.account.withdrawnWei)}</p>
                  <p className={pnlWeiClass(vault.account.pnlWei)}>
                    PnL: {formatEthFromWei(vault.account.pnlWei)} (
                    {formatSignedPctBps(vault.account.pnlBps)})
                  </p>
                </div>
              ) : (
                <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                  No vault position yet.
                </p>
              )
            ) : (
              <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                Connect wallet to view your vault position.
              </p>
            )}
          </div>

          {isOperatorView ? (
            <div className="border border-[var(--rule-light)] p-4 lg:col-span-2">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
              Funder Leaderboard ({vault.funderCount})
            </h2>
            {funderRows.length === 0 ? (
              <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                No funders yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--rule-light)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                      <th className="py-2 pr-3">Funder</th>
                      <th className="py-2 pr-3">Equity</th>
                      <th className="py-2 pr-3">Deposited</th>
                      <th className="py-2 pr-3">Withdrawn</th>
                      <th className="py-2 pr-3">Shares</th>
                      <th className="py-2 pr-0">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funderRows.map((row) => (
                      <tr
                        key={row.address}
                        className="border-b border-[var(--rule-light)] last:border-0"
                      >
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                          {shortHex(row.address)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatEthFromWei(row.equityWei)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatEthFromWei(row.depositedWei)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatEthFromWei(row.withdrawnWei)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {row.shares}
                        </td>
                        <td
                          className={`py-2 pr-0 font-mono text-[10px] ${pnlWeiClass(
                            row.pnlWei
                          )}`}
                        >
                          {formatEthFromWei(row.pnlWei)} (
                          {formatSignedPctBps(row.pnlBps)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          ) : (
            <div className="border border-[var(--rule-light)] p-4 lg:col-span-2">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
                Funder Leaderboard
              </h2>
              <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
                Individual funder data is restricted to operator view.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {isVaultRailEnabled && safeVault ? (
        <section className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Legacy Agent Vault
          </h2>
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            The older agent vault is still configured at {shortHex(safeVault.address)}, but `/markets` is now prioritizing the new BaseCapitalVault rail as the canonical share-backed flow.
          </p>
        </section>
      ) : null}

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Open Positions ({filteredTotals?.openPositions ?? 0})
        </h2>
        {!hasFullMarketAccess ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            Detailed open-position telemetry unlocks for verified 100k MO holders.
          </p>
        ) : filteredOpen.length === 0 ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            No open positions.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--rule-light)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Chain</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Lev</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Current</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Unrealized</th>
                  <th className="py-2 pr-0">Opened</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpen.map((row) => {
                  const isExpanded = expandedPositionId === row.position.id;
                  return (
                    <Fragment key={row.position.id}>
                      <tr
                        className="border-b border-[var(--rule-light)] last:border-0 cursor-pointer hover:bg-[var(--paper-tint)]"
                        onClick={() => setExpandedPositionId(isExpanded ? null : row.position.id)}
                      >
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                          {symbolForPosition(row.position)}
                          <span className="text-[8px] text-[var(--ink-faint)] ml-1">{isExpanded ? "▾" : "▸"}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-[9px] text-[var(--ink-faint)]">
                          {venueLabel(row.position.venue)}
                        </td>
                        <td className={`py-2 pr-3 font-mono text-[10px] ${row.position.direction === "short" ? "text-red-700" : "text-emerald-700"}`}>
                          {row.position.direction === "short" ? "SHORT" : "LONG"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {row.position.leverage ? `${row.position.leverage}x` : "--"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatUsd(row.position.entryPriceUsd)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatUsd(row.currentPriceUsd)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatUsd(row.position.entryNotionalUsd)}
                        </td>
                        <td
                          className={`py-2 pr-3 font-mono text-[10px] ${pnlClass(
                            row.unrealizedPnlUsd
                          )}`}
                        >
                          {formatUsd(row.unrealizedPnlUsd)} (
                          {formatPct(row.unrealizedPnlPct)})
                        </td>
                        <td className="py-2 pr-0 font-mono text-[10px] text-[var(--ink-faint)]">
                          {new Date(row.position.openedAt).toLocaleString()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr><td colSpan={9} className="p-0"><RationalePanel position={row.position} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Closed Positions ({filteredTotals?.closedPositions ?? 0})
        </h2>
        {!hasFullMarketAccess ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            Detailed trade history unlocks for verified 100k MO holders.
          </p>
        ) : filteredClosed.length === 0 ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            No closed positions yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--rule-light)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Chain</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Lev</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Exit</th>
                  <th className="py-2 pr-3">Fees (est)</th>
                  <th className="py-2 pr-3">Realized</th>
                  <th className="py-2 pr-3">Held</th>
                  <th className="py-2 pr-0">Closed</th>
                </tr>
              </thead>
              <tbody>
                {filteredClosed.slice(closedPage * CLOSED_PAGE_SIZE, (closedPage + 1) * CLOSED_PAGE_SIZE).map((row) => {
                  const isExpanded = expandedPositionId === row.position.id;
                  return (
                    <Fragment key={row.position.id}>
                      <tr
                        className="border-b border-[var(--rule-light)] last:border-0 cursor-pointer hover:bg-[var(--paper-tint)]"
                        onClick={() => setExpandedPositionId(isExpanded ? null : row.position.id)}
                      >
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                          {symbolForPosition(row.position)}
                          <span className="text-[8px] text-[var(--ink-faint)] ml-1">{isExpanded ? "▾" : "▸"}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-[9px] text-[var(--ink-faint)]">
                          {venueLabel(row.position.venue)}
                        </td>
                        <td className={`py-2 pr-3 font-mono text-[10px] ${row.position.direction === "short" ? "text-red-700" : "text-emerald-700"}`}>
                          {row.position.direction === "short" ? "SHORT" : "LONG"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {row.position.leverage ? `${row.position.leverage}x` : "--"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                          {formatUsd(row.position.entryNotionalUsd)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatUsd(row.position.entryPriceUsd)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">
                          {formatUsd(row.position.exitPriceUsd)}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--accent-red)]">
                          {row.estimatedFeesUsd ? `-${formatUsd(row.estimatedFeesUsd)}` : "--"}
                        </td>
                        <td
                          className={`py-2 pr-3 font-mono text-[10px] ${pnlClass(
                            row.realizedPnlUsd
                          )}`}
                        >
                          {formatUsd(row.realizedPnlUsd)} (
                          {formatPct(row.realizedPnlPct)})
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-faint)]">
                          {formatHoldDuration(row.position.openedAt, row.position.closedAt)}
                        </td>
                        <td className="py-2 pr-0 font-mono text-[10px] text-[var(--ink-faint)]">
                          {row.position.closedAt
                            ? new Date(row.position.closedAt).toLocaleString()
                            : "--"}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr><td colSpan={11} className="p-0"><RationalePanel position={row.position} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filteredClosed.length > CLOSED_PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-[var(--ink-faint)]">
                <span>
                  Page {closedPage + 1} of {Math.ceil(filteredClosed.length / CLOSED_PAGE_SIZE)}
                  {" "}({filteredClosed.length} total)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setClosedPage((p) => Math.max(0, p - 1))}
                    disabled={closedPage === 0}
                    className="border border-[var(--rule)] px-2 py-0.5 uppercase tracking-wider hover:bg-[var(--bg-alt)] disabled:opacity-30"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setClosedPage((p) => Math.min(Math.ceil(filteredClosed.length / CLOSED_PAGE_SIZE) - 1, p + 1))}
                    disabled={(closedPage + 1) * CLOSED_PAGE_SIZE >= filteredClosed.length}
                    className="border border-[var(--rule)] px-2 py-0.5 uppercase tracking-wider hover:bg-[var(--bg-alt)] disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Bot Terminal
        </h2>
        <AgentBotTerminal
          feePct={feePct}
          executionVenue={activeVenues}
          dryRun={data.dryRun}
          openPositions={combinedTotals?.openPositions ?? 0}
          grossPnlUsd={combinedTotals?.grossPnlUsd ?? 0}
          netPnlUsd={combinedTotals?.netPnlAfterFeeUsd ?? 0}
          fundingAddress={activeVaultRail ? activeVaultRail.baseVaultAddress : safeVault ? safeVault.address : data.fundingAddress ?? "operator-only"}
          isUnlocked={subscriptionUnlocked}
          unlockSummary={unlockSummary}
          canWithdraw={isVaultRailEnabled || isVaultEnabled}
          freeAccess={subscription?.freeAccess ?? null}
          onFundAmount={async (amount) =>
            isVaultRailEnabled
              ? submitVaultRailDeposit(amount)
              : isVaultEnabled
              ? submitVaultDeposit(amount)
              : submitDirectFund(amount)
          }
          onWithdrawAmount={isVaultRailEnabled ? submitVaultRailWithdraw : isVaultEnabled ? submitVaultWithdraw : undefined}
          onUnlockPlan={handleUnlockPlan}
          tradingContext={{
            executionVenue: activeVenues,
            dryRun: data.dryRun,
            feePct,
            fundingAddress: activeVaultRail ? activeVaultRail.baseVaultAddress : safeVault ? safeVault.address : data.fundingAddress ?? "holder-only",
            canWithdraw: isVaultRailEnabled || isVaultEnabled,
            openPositions: combinedTotals?.openPositions ?? 0,
            closedPositions: combinedTotals?.closedPositions ?? 0,
            grossPnlUsd: combinedTotals?.grossPnlUsd ?? 0,
            netPnlUsd: combinedTotals?.netPnlAfterFeeUsd ?? 0,
            unrealizedPnlUsd: combinedTotals?.unrealizedPnlUsd ?? 0,
            realizedPnlUsd: combinedTotals?.realizedPnlUsd ?? 0,
            deployedUsd: combinedTotals?.deployedUsd ?? 0,
            positions: allOpen.map((o) => ({
              symbol: o.position.marketSymbol ?? KNOWN_TOKENS[o.position.tokenAddress.toLowerCase()] ?? shortHex(o.position.tokenAddress),
              entryPrice: o.position.entryPriceUsd,
              currentPrice: o.currentPriceUsd,
              unrealizedPnl: o.unrealizedPnlUsd,
              size: o.position.entryNotionalUsd,
              venue: o.position.venue,
            })),
            vault: activeVaultRail ? {
              aumUsd: Number(formatEther(BigInt(activeVaultRail.totalAssetsEthWei))) * ethPriceUsd,
              liquidUsd: Number(formatEther(BigInt(activeVaultRail.liquidEthWei))) * ethPriceUsd,
              deployedUsd: Number(formatEther(railDeployedWei)) * ethPriceUsd,
              totalFunders: safeVault?.funderCount ?? 0,
              feePct: activeVaultRail.performanceFeeBps / 100,
            } : safeVault ? {
              aumUsd: Number(formatEther(BigInt(safeVault.totalManagedAssetsWei))) * ethPriceUsd,
              liquidUsd: Number(formatEther(BigInt(safeVault.liquidAssetsWei))) * ethPriceUsd,
              deployedUsd: Number(formatEther(BigInt(safeVault.deployedCapitalWei))) * ethPriceUsd,
              totalFunders: safeVault.funderCount,
              feePct: safeVault.performanceFeeBps / 100,
            } : undefined,
          } satisfies TerminalTradingContext}
        />
      </section>

      {/* Strategy Config shell — visual preview, not wired to auto-execution */}
      <StrategyConfigShell />
    </div>
  );
}

// ============================================================================
// STRATEGY CONFIG SHELL — "coming soon" strategy configuration panel
// ============================================================================

const STRATEGY_STORAGE_KEY = "pooter:user-strategy";

interface UserStrategy {
  stopLossPct: number;
  takeProfitPct: number;
  maxLeverage: number;
  markets: string[];
  autoTrade: boolean;
}

const DEFAULT_STRATEGY: UserStrategy = {
  stopLossPct: 12,
  takeProfitPct: 30,
  maxLeverage: 40,
  markets: ["BTC", "ETH", "SOL"],
  autoTrade: false,
};

const AVAILABLE_MARKETS = [
  "BTC", "ETH", "SOL", "HYPE", "XRP", "SUI", "DOGE", "LINK",
  "AVAX", "BNB", "PAXG", "TAO", "ZEC", "FET", "TRUMP", "BCH",
  "WLD", "AAVE", "OP", "ARB",
];

function StrategyConfigShell() {
  const [expanded, setExpanded] = useState(false);
  const [strategy, setStrategy] = useState<UserStrategy>(DEFAULT_STRATEGY);
  const [showComingSoon, setShowComingSoon] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
      if (raw) setStrategy(JSON.parse(raw));
    } catch {}
  }, []);

  function updateStrategy(partial: Partial<UserStrategy>) {
    const next = { ...strategy, ...partial };
    setStrategy(next);
    try {
      localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function toggleMarket(market: string) {
    const markets = strategy.markets.includes(market)
      ? strategy.markets.filter((m) => m !== market)
      : [...strategy.markets, market];
    updateStrategy({ markets });
  }

  return (
    <section className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Strategy Config
        </h2>
        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="border border-[var(--rule-light)] p-4 space-y-4">
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            Configure your personal trading strategy. Connect a Bankr API key in the terminal to trade.
            Auto-execution coming soon — for now, use the terminal to manually execute trades.
          </p>

          {/* Stop Loss */}
          <div className="flex items-center justify-between">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)]">
              Stop Loss %
            </label>
            <input
              type="number"
              value={strategy.stopLossPct}
              onChange={(e) => updateStrategy({ stopLossPct: Number(e.target.value) })}
              min={1}
              max={50}
              className="w-20 border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 text-right font-mono text-[11px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
            />
          </div>

          {/* Take Profit */}
          <div className="flex items-center justify-between">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)]">
              Take Profit %
            </label>
            <input
              type="number"
              value={strategy.takeProfitPct}
              onChange={(e) => updateStrategy({ takeProfitPct: Number(e.target.value) })}
              min={1}
              max={200}
              className="w-20 border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 text-right font-mono text-[11px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
            />
          </div>

          {/* Max Leverage */}
          <div className="flex items-center justify-between">
            <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)]">
              Max Leverage
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={strategy.maxLeverage}
                onChange={(e) => updateStrategy({ maxLeverage: Number(e.target.value) })}
                min={1}
                max={50}
                className="w-20 border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 text-right font-mono text-[11px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
              />
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">x</span>
            </div>
          </div>

          {/* Markets */}
          <div>
            <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)]">
              Markets
            </label>
            <div className="flex flex-wrap gap-1">
              {AVAILABLE_MARKETS.map((market) => (
                <button
                  key={market}
                  onClick={() => toggleMarket(market)}
                  className={`border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] ${
                    strategy.markets.includes(market)
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-[var(--rule-light)] text-[var(--ink-faint)] hover:border-[var(--rule)]"
                  }`}
                >
                  {market}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Trade Toggle — Coming Soon */}
          <div className="relative flex items-center justify-between border-t border-[var(--rule-light)] pt-4">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)]">
                Auto-Execute Signals
              </label>
              <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                Route platform signals to your Bankr wallet automatically
              </p>
            </div>
            <button
              onClick={() => setShowComingSoon(true)}
              onMouseLeave={() => setShowComingSoon(false)}
              className="relative border border-[var(--rule-light)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-faint)] opacity-60 cursor-not-allowed"
            >
              Off
              {showComingSoon && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-mono text-[8px] text-[var(--ink)]">
                  Coming Soon
                </span>
              )}
            </button>
          </div>

          <p className="font-mono text-[8px] text-[var(--ink-faint)]">
            Settings saved locally. When auto-execution launches, these parameters will define
            your personal strategy — including stop loss, take profit, leverage caps, and which
            markets to trade. The platform&apos;s signal engine will generate entries and exits
            routed through your connected Bankr wallet.
          </p>
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-[var(--rule-light)] p-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        {label}
      </p>
      <p className={`mt-1 font-headline text-xl ${valueClass ?? "text-[var(--ink)]"}`}>
        {value}
      </p>
    </div>
  );
}
