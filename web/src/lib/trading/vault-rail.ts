import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hash,
} from "viem";
import { arbitrum, arbitrumSepolia, base, baseSepolia, type Chain } from "viem/chains";

import { fetchTokenMarketSnapshot } from "./market";
import { waitForSuccess } from "./swap";
import { fetchHyperliquidAccountValueUsd, resolveHyperliquidAccountAddress } from "./hyperliquid";
import type { ExecutionVenue, TraderExecutionConfig, VaultRailConfig } from "./types";

const BASE_VAULT_ABI = [
  { type: "function", name: "liquidAssetsStored", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "reserveAssetsStored", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "pendingBridgeAssetsStored", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "hlStrategyAssetsStored", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "accruedFeesEth", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "sharePriceE18", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const BRIDGE_ROUTER_ABI = [
  { type: "function", name: "totalPendingAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "bridgeToArbitrum", inputs: [{ type: "uint256" }, { type: "bytes32" }], outputs: [{ type: "bytes32" }], stateMutability: "nonpayable" },
  { type: "function", name: "markReceivedOnArbitrum", inputs: [{ type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markStrategyFunded", inputs: [{ type: "bytes32" }, { type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "beginReturnFromStrategy", inputs: [{ type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "setReturnBridgeAssets", inputs: [{ type: "bytes32" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "finalizeReturnToBase", inputs: [{ type: "bytes32" }, { type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markFailedRoute", inputs: [{ type: "bytes32" }, { type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const NAV_REPORTER_ABI = [
  { type: "function", name: "lastReportTimestamp", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "minReportInterval", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "reportNav", inputs: [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const RESERVE_ALLOCATOR_ABI = [
  { type: "function", name: "totalManagedAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const ARB_ESCROW_ABI = [
  { type: "function", name: "totalEscrowed", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const HL_STRATEGY_MANAGER_ABI = [
  { type: "function", name: "totalDeployedAssets", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const BASE_VAULT_DETAIL_ABI = [
  { type: "function", name: "performanceFeeBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "reserveTargetBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "liquidTargetBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "hlTargetBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "lastNavTimestamp", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "lastNavHash", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "paused", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "previewRedeem", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

export interface VaultRailSnapshot {
  liquidEthWei: bigint;
  reserveEthWei: bigint;
  pendingBridgeEthWei: bigint;
  hlStrategyEthWei: bigint;
  accruedFeesEthWei: bigint;
  totalAssetsEthWei: bigint;
  sharePriceE18: bigint;
  routerPendingEthWei: bigint;
  reserveManagedEthWei: bigint;
  arbEscrowBridgeAssetRaw: bigint;
  strategyBridgeAssetRaw: bigint;
  navLastReportedAt: number;
  navMinIntervalMs: number;
}

export interface VaultRailAccountSnapshot {
  address: Address;
  shares: string;
  assetsEthWei: string;
  shareOfSupplyBps: string;
}

export interface VaultRailOverview {
  enabled: true;
  runnerId: string;
  label: string;
  executionVenue: ExecutionVenue;
  baseChainId: number;
  arbChainId: number;
  baseVaultAddress: Address;
  reserveAllocatorAddress: Address | null;
  bridgeRouterAddress: Address;
  navReporterAddress: Address;
  assetConverterAddress: Address | null;
  bridgeAdapterAddress: Address | null;
  arbTransitEscrowAddress: Address | null;
  hlStrategyManagerAddress: Address | null;
  baseBridgeAssetAddress: Address;
  arbBridgeAssetAddress: Address;
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
  lastNavHash: Hash;
  paused: boolean;
  account: VaultRailAccountSnapshot | null;
}

export interface VaultRailKeeperReport {
  enabled: boolean;
  action: "disabled" | "snapshot-only" | "nav-reported" | "nav-skipped";
  reason?: string;
  snapshot?: VaultRailSnapshot;
  strategyEquityUsd?: number;
  ethPriceUsd?: number | null;
  strategyAssetsEthWei?: bigint;
  navHash?: `0x${string}`;
  txHash?: `0x${string}`;
}

function getBaseChain(chainId: number): Chain {
  return chainId === baseSepolia.id ? baseSepolia : base;
}

function getArbChain(chainId: number): Chain {
  return chainId === arbitrumSepolia.id ? arbitrumSepolia : arbitrum;
}

function getVaultRailConfig(config: TraderExecutionConfig): VaultRailConfig {
  if (!config.vaultRail?.enabled) {
    throw new Error("vault rail is not enabled for this runner");
  }
  return config.vaultRail;
}

function createVaultRailClients(config: TraderExecutionConfig) {
  const rail = getVaultRailConfig(config);
  const account = privateKeyToAccount(config.privateKey);
  const { basePublicClient, arbPublicClient } = createVaultRailPublicClients(rail);
  const baseChain = getBaseChain(rail.baseChainId);
  const arbChain = getArbChain(rail.arbChainId);

  const baseWalletClient = createWalletClient({
    chain: baseChain,
    account,
    transport: http(rail.baseRpcUrl, { timeout: 12_000 }),
  });
  const arbWalletClient = createWalletClient({
    chain: arbChain,
    account,
    transport: http(rail.arbRpcUrl, { timeout: 12_000 }),
  });

  return {
    account,
    rail,
    basePublicClient,
    baseWalletClient,
    arbPublicClient,
    arbWalletClient,
  };
}

function createVaultRailPublicClients(rail: VaultRailConfig) {
  const baseChain = getBaseChain(rail.baseChainId);
  const arbChain = getArbChain(rail.arbChainId);

  const basePublicClient = createPublicClient({
    chain: baseChain,
    transport: http(rail.baseRpcUrl, { timeout: 12_000 }),
  });
  const arbPublicClient = createPublicClient({
    chain: arbChain,
    transport: http(rail.arbRpcUrl, { timeout: 12_000 }),
  });

  return {
    basePublicClient,
    arbPublicClient,
  };
}

async function readVaultRailSnapshotFromRailConfig(rail: VaultRailConfig): Promise<VaultRailSnapshot> {
  const { basePublicClient, arbPublicClient } = createVaultRailPublicClients(rail);

  const [
    liquidEthWei,
    reserveEthWei,
    pendingBridgeEthWei,
    hlStrategyEthWei,
    accruedFeesEthWei,
    totalAssetsEthWei,
    sharePriceE18,
    routerPendingEthWei,
    reserveManagedEthWei,
    arbEscrowBridgeAssetRaw,
    strategyBridgeAssetRaw,
    navLastReportedAt,
    navMinIntervalMs,
  ] = await Promise.all([
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "liquidAssetsStored" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "reserveAssetsStored" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "pendingBridgeAssetsStored" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "hlStrategyAssetsStored" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "accruedFeesEth" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "totalAssets" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_ABI, functionName: "sharePriceE18" }),
    basePublicClient.readContract({ address: rail.bridgeRouterAddress, abi: BRIDGE_ROUTER_ABI, functionName: "totalPendingAssets" }),
    rail.reserveAllocatorAddress
      ? basePublicClient.readContract({ address: rail.reserveAllocatorAddress, abi: RESERVE_ALLOCATOR_ABI, functionName: "totalManagedAssets" })
      : Promise.resolve(BigInt(0)),
    rail.arbTransitEscrowAddress
      ? arbPublicClient.readContract({ address: rail.arbTransitEscrowAddress, abi: ARB_ESCROW_ABI, functionName: "totalEscrowed" })
      : Promise.resolve(BigInt(0)),
    rail.hlStrategyManagerAddress
      ? arbPublicClient.readContract({ address: rail.hlStrategyManagerAddress, abi: HL_STRATEGY_MANAGER_ABI, functionName: "totalDeployedAssets" })
      : Promise.resolve(BigInt(0)),
    basePublicClient.readContract({ address: rail.navReporterAddress, abi: NAV_REPORTER_ABI, functionName: "lastReportTimestamp" }),
    basePublicClient.readContract({ address: rail.navReporterAddress, abi: NAV_REPORTER_ABI, functionName: "minReportInterval" }),
  ]);

  return {
    liquidEthWei,
    reserveEthWei,
    pendingBridgeEthWei,
    hlStrategyEthWei,
    accruedFeesEthWei,
    totalAssetsEthWei,
    sharePriceE18,
    routerPendingEthWei,
    reserveManagedEthWei,
    arbEscrowBridgeAssetRaw,
    strategyBridgeAssetRaw,
    navLastReportedAt: Number(navLastReportedAt),
    navMinIntervalMs: Number(navMinIntervalMs) * 1000,
  };
}

export async function readVaultRailSnapshot(config: TraderExecutionConfig): Promise<VaultRailSnapshot> {
  const rail = getVaultRailConfig(config);
  return readVaultRailSnapshotFromRailConfig(rail);
}

export async function fetchVaultRailOverview(
  config: TraderExecutionConfig,
  options?: {
    runnerId?: string;
    label?: string;
    executionVenue?: ExecutionVenue;
    account?: Address | null;
    includeAccount?: boolean;
  }
): Promise<VaultRailOverview | null> {
  if (!config.vaultRail?.enabled) {
    return null;
  }

  const rail = config.vaultRail;
  const { basePublicClient } = createVaultRailPublicClients(rail);
  const snapshot = await readVaultRailSnapshotFromRailConfig(rail);
  const includeAccount = options?.includeAccount ?? true;
  const account = includeAccount ? options?.account ?? null : null;

  const [
    performanceFeeBps,
    targetReserveBps,
    targetLiquidBps,
    targetHlBps,
    lastNavTimestamp,
    lastNavHash,
    totalShares,
    paused,
  ] = await Promise.all([
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "performanceFeeBps" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "reserveTargetBps" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "liquidTargetBps" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "hlTargetBps" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "lastNavTimestamp" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "lastNavHash" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "totalSupply" }),
    basePublicClient.readContract({ address: rail.baseVaultAddress, abi: BASE_VAULT_DETAIL_ABI, functionName: "paused" }),
  ]);

  const accountSnapshot = account
    ? await (async (): Promise<VaultRailAccountSnapshot> => {
        const shares = await basePublicClient.readContract({
          address: rail.baseVaultAddress,
          abi: BASE_VAULT_DETAIL_ABI,
          functionName: "balanceOf",
          args: [account],
        });
        const assetsEthWei = shares > BigInt(0)
          ? await basePublicClient.readContract({
              address: rail.baseVaultAddress,
              abi: BASE_VAULT_DETAIL_ABI,
              functionName: "previewRedeem",
              args: [shares],
            })
          : BigInt(0);
        const shareOfSupplyBps =
          totalShares > BigInt(0)
            ? ((shares * BigInt(10_000)) / totalShares).toString()
            : "0";

        return {
          address: account,
          shares: shares.toString(),
          assetsEthWei: assetsEthWei.toString(),
          shareOfSupplyBps,
        };
      })()
    : null;

  return {
    enabled: true,
    runnerId: options?.runnerId ?? "primary",
    label: options?.label ?? "primary",
    executionVenue: options?.executionVenue ?? config.executionVenue,
    baseChainId: rail.baseChainId,
    arbChainId: rail.arbChainId,
    baseVaultAddress: rail.baseVaultAddress,
    reserveAllocatorAddress: rail.reserveAllocatorAddress ?? null,
    bridgeRouterAddress: rail.bridgeRouterAddress,
    navReporterAddress: rail.navReporterAddress,
    assetConverterAddress: rail.assetConverterAddress ?? null,
    bridgeAdapterAddress: rail.bridgeAdapterAddress ?? null,
    arbTransitEscrowAddress: rail.arbTransitEscrowAddress ?? null,
    hlStrategyManagerAddress: rail.hlStrategyManagerAddress ?? null,
    baseBridgeAssetAddress: rail.baseBridgeAssetAddress,
    arbBridgeAssetAddress: rail.arbBridgeAssetAddress,
    autoReportNav: rail.autoReportNav,
    performanceFeeBps: Number(performanceFeeBps),
    totalShares: totalShares.toString(),
    sharePriceE18: snapshot.sharePriceE18.toString(),
    totalAssetsEthWei: snapshot.totalAssetsEthWei.toString(),
    liquidEthWei: snapshot.liquidEthWei.toString(),
    reserveEthWei: snapshot.reserveEthWei.toString(),
    pendingBridgeEthWei: snapshot.pendingBridgeEthWei.toString(),
    hlStrategyEthWei: snapshot.hlStrategyEthWei.toString(),
    accruedFeesEthWei: snapshot.accruedFeesEthWei.toString(),
    routerPendingEthWei: snapshot.routerPendingEthWei.toString(),
    reserveManagedEthWei: snapshot.reserveManagedEthWei.toString(),
    arbEscrowBridgeAssetRaw: snapshot.arbEscrowBridgeAssetRaw.toString(),
    strategyBridgeAssetRaw: snapshot.strategyBridgeAssetRaw.toString(),
    targetLiquidBps: Number(targetLiquidBps),
    targetReserveBps: Number(targetReserveBps),
    targetHlBps: Number(targetHlBps),
    navLastReportedAt: snapshot.navLastReportedAt,
    navMinIntervalMs: snapshot.navMinIntervalMs,
    lastNavTimestamp: Number(lastNavTimestamp),
    lastNavHash,
    paused,
    account: accountSnapshot,
  };
}

async function resolveEthPriceUsd(config: TraderExecutionConfig): Promise<number | null> {
  const rail = getVaultRailConfig(config);
  if (rail.navEthPriceUsdOverride && Number.isFinite(rail.navEthPriceUsdOverride) && rail.navEthPriceUsdOverride > 0) {
    return rail.navEthPriceUsdOverride;
  }
  const snapshot = await fetchTokenMarketSnapshot(config.quoteTokens.WETH, { chainId: "base" });
  return snapshot.priceUsd;
}

export async function runVaultRailKeeper(config: TraderExecutionConfig): Promise<VaultRailKeeperReport> {
  if (!config.vaultRail?.enabled) {
    return {
      enabled: false,
      action: "disabled",
      reason: "vault rail is not enabled",
    };
  }

  const { rail, account, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const snapshot = await readVaultRailSnapshot(config);

  if (!rail.autoReportNav) {
    return {
      enabled: true,
      action: "snapshot-only",
      snapshot,
      reason: "auto nav reporting disabled",
    };
  }

  const now = Date.now();
  const nextEligibleAt = snapshot.navLastReportedAt > 0 ? snapshot.navLastReportedAt * 1000 + Math.max(rail.minNavIntervalMs, snapshot.navMinIntervalMs) : 0;
  if (nextEligibleAt > now) {
    return {
      enabled: true,
      action: "nav-skipped",
      snapshot,
      reason: `next nav window in ${Math.max(0, nextEligibleAt - now)}ms`,
    };
  }

  const ethPriceUsd = await resolveEthPriceUsd(config);
  if (!ethPriceUsd || !Number.isFinite(ethPriceUsd) || ethPriceUsd <= 0) {
    return {
      enabled: true,
      action: "nav-skipped",
      snapshot,
      reason: "missing ETH/USD price for nav report",
      ethPriceUsd,
    };
  }

  const hlAccount = resolveHyperliquidAccountAddress(config, account.address);
  const strategyEquityUsd = await fetchHyperliquidAccountValueUsd(config, hlAccount);
  if (!Number.isFinite(strategyEquityUsd) || strategyEquityUsd === null || strategyEquityUsd <= 0) {
    return {
      enabled: true,
      action: "nav-skipped",
      snapshot,
      reason: "missing Hyperliquid strategy equity for nav report",
      ethPriceUsd,
    };
  }
  const strategyAssetsEth = strategyEquityUsd / ethPriceUsd;
  const strategyAssetsEthWei = parseUnits(strategyAssetsEth.toFixed(18), 18);
  const navHash = keccak256(
    toBytes(
      JSON.stringify({
        id: randomUUID(),
        ts: now,
        hlAccount,
        strategyEquityUsd,
        ethPriceUsd,
        strategyAssetsEth,
      })
    )
  );

  const txHash = await baseWalletClient.writeContract({
    address: rail.navReporterAddress,
    abi: NAV_REPORTER_ABI,
    functionName: "reportNav",
    args: [strategyAssetsEthWei, rail.navFeeEthRaw, navHash],
  });
  await waitForSuccess(basePublicClient, txHash);

  return {
    enabled: true,
    action: "nav-reported",
    snapshot,
    strategyEquityUsd,
    ethPriceUsd,
    strategyAssetsEthWei,
    navHash,
    txHash,
  };
}

export async function initiateVaultRailBridge(
  config: TraderExecutionConfig,
  assetsWei: bigint,
  intentId?: `0x${string}`
): Promise<`0x${string}`> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const nextIntentId = intentId ?? keccak256(toBytes(`vault-rail:${Date.now()}:${assetsWei.toString()}`));
  const txHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "bridgeToArbitrum",
    args: [assetsWei, nextIntentId],
  });
  await waitForSuccess(basePublicClient, txHash);
  return txHash;
}

export async function markVaultRailReceivedOnArb(config: TraderExecutionConfig, routeId: `0x${string}`): Promise<`0x${string}`> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const txHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "markReceivedOnArbitrum",
    args: [routeId],
  });
  await waitForSuccess(basePublicClient, txHash);
  return txHash;
}

export async function markVaultRailStrategyFunded(
  config: TraderExecutionConfig,
  routeId: `0x${string}`,
  settlementId: `0x${string}`
): Promise<`0x${string}`> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const txHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "markStrategyFunded",
    args: [routeId, settlementId],
  });
  await waitForSuccess(basePublicClient, txHash);
  return txHash;
}

export async function beginVaultRailReturn(
  config: TraderExecutionConfig,
  routeId: `0x${string}`,
  assetsWei: bigint,
  settlementId: `0x${string}`,
  bridgeAssetsRaw?: bigint
): Promise<`0x${string}`[]> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const hashes: `0x${string}`[] = [];
  const beginHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "beginReturnFromStrategy",
    args: [routeId, assetsWei, settlementId],
  });
  await waitForSuccess(basePublicClient, beginHash);
  hashes.push(beginHash);

  if (bridgeAssetsRaw && bridgeAssetsRaw > BigInt(0)) {
    const quoteHash = await baseWalletClient.writeContract({
      address: rail.bridgeRouterAddress,
      abi: BRIDGE_ROUTER_ABI,
      functionName: "setReturnBridgeAssets",
      args: [routeId, bridgeAssetsRaw],
    });
    await waitForSuccess(basePublicClient, quoteHash);
    hashes.push(quoteHash);
  }

  return hashes;
}

export async function finalizeVaultRailReturn(
  config: TraderExecutionConfig,
  routeId: `0x${string}`,
  completionId: `0x${string}`
): Promise<`0x${string}`> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const txHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "finalizeReturnToBase",
    args: [routeId, completionId],
  });
  await waitForSuccess(basePublicClient, txHash);
  return txHash;
}

export async function failVaultRailRoute(
  config: TraderExecutionConfig,
  routeId: `0x${string}`,
  completionId: `0x${string}`
): Promise<`0x${string}`> {
  const { rail, basePublicClient, baseWalletClient } = createVaultRailClients(config);
  const txHash = await baseWalletClient.writeContract({
    address: rail.bridgeRouterAddress,
    abi: BRIDGE_ROUTER_ABI,
    functionName: "markFailedRoute",
    args: [routeId, completionId],
  });
  await waitForSuccess(basePublicClient, txHash);
  return txHash;
}

export function formatVaultRailEth(value: bigint): string {
  return formatUnits(value, 18);
}
