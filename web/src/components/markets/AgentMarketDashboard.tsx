"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AGENT_VAULT_ABI } from "@/lib/contracts";
import { AgentBotTerminal } from "@/components/markets/AgentBotTerminal";
import TradingChart from "@/components/markets/TradingChart";
import type { TerminalTradingContext } from "@/lib/terminal-types";

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
  status: "open" | "closed";
  txHash?: `0x${string}`;
  exitTxHash?: `0x${string}`;
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

interface ParallelRunnerEntry {
  runnerId: string;
  label: string;
  performance: TraderPerformanceReport;
}

interface MetricsResponse {
  performance?: TraderPerformanceReport;
  parallel?: ParallelRunnerEntry[];
  vault?: VaultOverview | null;
  access?: {
    operator: boolean;
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

function formatSignedPctBps(value: string): string {
  try {
    const bps = Number(value);
    if (!Number.isFinite(bps)) return "--";
    return `${(bps / 100).toFixed(2)}%`;
  } catch {
    return "--";
  }
}

function trimDecimal(raw: string, maxFractionDigits = 4): string {
  if (!raw.includes(".")) return raw;
  const [whole, frac] = raw.split(".");
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
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
  const [metricsAccess, setMetricsAccess] = useState<MetricsResponse["access"] | null>(null);
  const [ethPriceUsd, setEthPriceUsd] = useState<number>(0);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closedPage, setClosedPage] = useState(0);
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
      setMetricsAccess(payload.access ?? { operator: false });

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

  const feePct = useMemo(() => {
    if (vault?.enabled) return vault.performanceFeeBps / 100;
    if (!data) return 5;
    return data.performanceFeeBps / 100;
  }, [data, vault]);

  const funderRows = useMemo(
    () => (vault?.funders ? sortFundersByEquity(vault.funders) : []),
    [vault]
  );
  const isOperatorView = metricsAccess?.operator === true;

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

  const submitDirectFund = useCallback(
    async (amountRaw: string): Promise<string> => {
      try {
        setActionError(null);
        if (!data) {
          throw new Error("Funding destination unavailable");
        }
        if (!data.fundingAddress) {
          throw new Error("Direct funding is restricted to operator view");
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
      if (isVaultEnabled) {
        await submitVaultDeposit(depositAmount);
        return;
      }
      await submitDirectFund(depositAmount);
    } catch {
      // errors are already pushed into actionError by submit helpers
    }
  }, [depositAmount, isVaultEnabled, submitDirectFund, submitVaultDeposit]);

  const handleWithdraw = useCallback(async () => {
    try {
      await submitVaultWithdraw(withdrawAmount);
    } catch {
      // errors are already pushed into actionError by submit helpers
    }
  }, [submitVaultWithdraw, withdrawAmount]);

  const handleUnlockPlan = useCallback(async (): Promise<string> => {
    if (!connectedAddress) {
      throw new Error("Connect a wallet holding 100,000 MO for full terminal access");
    }
    const requiredBalance = subscription?.requiredMoBalance || "100,000";
    const currentBalance = subscription?.account?.balanceMo;
    return currentBalance
      ? `Current wallet balance: ${currentBalance} MO. Hold ${requiredBalance} MO for full terminal access.`
      : `Full terminal access unlocks automatically for wallets holding ${requiredBalance} MO.`;
  }, [connectedAddress, subscription?.account?.balanceMo, subscription?.requiredMoBalance]);

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

  const balances = isOperatorView ? data.readiness.balances.slice(0, 6) : [];
  const CLOSED_PAGE_SIZE = 15;
  const subscriptionUnlocked = subscription?.account?.unlocked === true;
  const expectedFundingChainId = fundingChainIdForVenue(data.executionVenue);
  const fundingFacts = isVaultEnabled
    ? [
        "Deposit mints vault shares to your wallet, so your position is tracked by address.",
        "The ETH stays in the vault until the manager allocates capital out to a strategy wallet.",
        data.executionVenue === "hyperliquid-perp"
          ? "Vault deposits do not automatically become Hyperliquid margin. Hyperliquid only sees funds after a separate allocation and transfer flow."
          : `Vault deposits fund the pooled strategy on ${chainLabel(expectedFundingChainId)}, not a personal trading account.`,
      ]
    : [
        `This sends native ETH directly to the agent funding wallet on ${chainLabel(expectedFundingChainId)}.`,
        "Direct-fund mode does not create shares, a per-user balance, or an onchain refund ledger for you.",
        data.executionVenue === "hyperliquid-perp"
          ? "Sending ETH here does not automatically top up Hyperliquid collateral. It only funds the bot wallet."
          : "This is a strategy wallet top-up, not a deposit into a personal account.",
      ];
  const unlockSummary = subscription
    ? subscriptionUnlocked
      ? `${subscription.account?.balanceMo || subscription.requiredMoBalance || "100000"} MO holder verified`
      : subscription.account?.balanceMo
        ? `${subscription.account.balanceMo} MO held • ${subscription.requiredMoBalance || "100000"} MO required`
        : `Hold ${subscription.requiredMoBalance || "100000"} MO in the connected wallet for full access`
    : null;

  return (
    <div className="space-y-6">
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Open PnL"
          value={formatUsd(combinedTotals?.unrealizedPnlUsd ?? 0)}
          valueClass={pnlClass(combinedTotals?.unrealizedPnlUsd ?? 0)}
        />
        <MetricCard
          label="Realized PnL"
          value={formatUsd(combinedTotals?.realizedPnlUsd ?? 0)}
          valueClass={pnlClass(combinedTotals?.realizedPnlUsd ?? 0)}
        />
        <MetricCard
          label="Gross PnL"
          value={formatUsd(combinedTotals?.grossPnlUsd ?? 0)}
          valueClass={pnlClass(combinedTotals?.grossPnlUsd ?? 0)}
        />
        <MetricCard
          label="Exch Fees (est)"
          value={`-${formatUsd(combinedTotals?.estimatedTradingFeesUsd ?? 0)}`}
          valueClass="text-[var(--accent-red)]"
        />
        <MetricCard
          label={`Perf Fee (${feePct.toFixed(1)}%)`}
          value={formatUsd(combinedTotals?.performanceFeeUsd ?? 0)}
        />
        <MetricCard
          label="Net PnL"
          value={formatUsd(combinedTotals?.netPnlAfterFeeUsd ?? 0)}
          valueClass={pnlClass(combinedTotals?.netPnlAfterFeeUsd ?? 0)}
        />
      </section>

      {vault?.enabled ? (
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
        <TradingChart height={340} />
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

          {isOperatorView ? (
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
              Detailed balances and live readiness checks are restricted to operator view.
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
            {isVaultEnabled ? "Fund Vault" : "Fund Agent"}
          </h2>
          <p className="mt-1 break-all font-mono text-[9px] text-[var(--ink-faint)]">
            {isVaultEnabled
              ? vault!.address
              : data.fundingAddress ?? "Operator view required"}
          </p>
          <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
            {isVaultEnabled
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
                {isActionPending ? "Pending..." : isVaultEnabled ? "Deposit" : "Fund"}
              </button>
            </div>

            {isVaultEnabled ? (
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
                  {isActionPending ? "Pending..." : "Withdraw"}
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

      {vault?.enabled ? (
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

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Open Positions ({combinedTotals?.openPositions ?? 0})
        </h2>
        {!isOperatorView ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            Detailed open-position telemetry is restricted to operator view.
          </p>
        ) : allOpen.length === 0 ? (
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
                {allOpen.map((row) => (
                  <tr
                    key={row.position.id}
                    className="border-b border-[var(--rule-light)] last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                      {symbolForPosition(row.position)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Closed Positions ({combinedTotals?.closedPositions ?? 0})
        </h2>
        {!isOperatorView ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
            Detailed trade history is restricted to operator view.
          </p>
        ) : allClosed.length === 0 ? (
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
                  <th className="py-2 pr-0">Closed</th>
                </tr>
              </thead>
              <tbody>
                {allClosed.slice(closedPage * CLOSED_PAGE_SIZE, (closedPage + 1) * CLOSED_PAGE_SIZE).map((row) => (
                  <tr
                    key={row.position.id}
                    className="border-b border-[var(--rule-light)] last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">
                      {symbolForPosition(row.position)}
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
                    <td className="py-2 pr-0 font-mono text-[10px] text-[var(--ink-faint)]">
                      {row.position.closedAt
                        ? new Date(row.position.closedAt).toLocaleString()
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allClosed.length > CLOSED_PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-[var(--ink-faint)]">
                <span>
                  Page {closedPage + 1} of {Math.ceil(allClosed.length / CLOSED_PAGE_SIZE)}
                  {" "}({allClosed.length} total)
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
                    onClick={() => setClosedPage((p) => Math.min(Math.ceil(allClosed.length / CLOSED_PAGE_SIZE) - 1, p + 1))}
                    disabled={(closedPage + 1) * CLOSED_PAGE_SIZE >= allClosed.length}
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
          fundingAddress={safeVault ? safeVault.address : data.fundingAddress ?? "operator-only"}
          isUnlocked={subscriptionUnlocked}
          unlockSummary={unlockSummary}
          canWithdraw={isVaultEnabled}
          monthlyFeeMo={subscription?.monthlyFeeMo}
          onFundAmount={async (amount) =>
            isVaultEnabled
              ? submitVaultDeposit(amount)
              : submitDirectFund(amount)
          }
          onWithdrawAmount={isVaultEnabled ? submitVaultWithdraw : undefined}
          onUnlockPlan={handleUnlockPlan}
          tradingContext={{
            executionVenue: activeVenues,
            dryRun: data.dryRun,
            feePct,
            fundingAddress: safeVault ? safeVault.address : data.fundingAddress ?? "operator-only",
            canWithdraw: isVaultEnabled,
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
            vault: safeVault ? {
              aumUsd: Number(formatEther(BigInt(safeVault.totalManagedAssetsWei))) * ethPriceUsd,
              liquidUsd: Number(formatEther(BigInt(safeVault.liquidAssetsWei))) * ethPriceUsd,
              deployedUsd: Number(formatEther(BigInt(safeVault.deployedCapitalWei))) * ethPriceUsd,
              totalFunders: safeVault.funderCount,
              feePct: safeVault.performanceFeeBps / 100,
            } : undefined,
          } satisfies TerminalTradingContext}
        />
      </section>
    </div>
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
