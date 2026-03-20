import "server-only";

import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseAbiItem,
  parseUnits,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { ERC20_ABI, MO_TOKEN, ZERO_ADDRESS } from "@/lib/contracts";

export interface TerminalSubscriptionSplit {
  key: "vault" | "lp";
  recipient: Address;
  requiredWei: string;
  requiredMo: string;
  paidWei: string;
  paidMo: string;
  remainingWei: string;
  remainingMo: string;
}

export interface TerminalSubscriptionStatus {
  enabled: boolean;
  accessMode?: "holder-balance";
  chainId: number;
  monthKey: string;
  token: {
    address: Address;
    symbol: "MO";
    decimals: number;
  };
  requiredMoBalance?: string;
  requiredWeiBalance?: string;
  monthlyFeeMo: string;
  monthlyFeeWei: string;
  splits: TerminalSubscriptionSplit[];
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

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const STATUS_CACHE_TTL_MS = 30_000;
const statusCache = new Map<string, { status: TerminalSubscriptionStatus; expiresAt: number }>();

function envAddress(...keys: string[]): Address | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const candidate = raw.trim();
    if (isAddress(candidate)) return candidate as Address;
  }
  return null;
}

function asPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function monthBoundsUtc(now = new Date()): { monthKey: string; startUnix: number } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = Date.UTC(year, month, 1, 0, 0, 0, 0);
  return {
    monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    startUnix: Math.floor(start / 1000),
  };
}

function formatMo(wei: bigint): string {
  const formatted = formatUnits(wei, MO_TOKEN.decimals);
  // Only strip trailing zeros after a decimal point — never from whole numbers
  // (e.g. "50.000000" → "50", but "50" stays "50", not "5")
  if (formatted.includes(".")) {
    return formatted.replace(/\.?0+$/, "") || "0";
  }
  return formatted || "0";
}

function getSubscriptionConfig() {
  const chainId = asPositiveInt(
    process.env.NEXT_PUBLIC_MO_SUBSCRIPTION_CHAIN_ID ?? process.env.MO_SUBSCRIPTION_CHAIN_ID,
    base.id
  );
  const chain = chainId === baseSepolia.id ? baseSepolia : base;
  const rpcUrl =
    process.env.MO_SUBSCRIPTION_RPC_URL ||
    process.env.AGENT_VAULT_RPC_URL ||
    (chainId === baseSepolia.id ? "https://sepolia.base.org" : "https://mainnet.base.org");

  const vaultRecipient =
    envAddress(
      "NEXT_PUBLIC_MO_SUBSCRIPTION_VAULT_ADDRESS",
      "MO_SUBSCRIPTION_VAULT_ADDRESS",
      "NEXT_PUBLIC_AGENT_VAULT_ADDRESS"
    ) ?? ZERO_ADDRESS;
  const lpRecipient =
    envAddress(
      "NEXT_PUBLIC_MO_SUBSCRIPTION_LP_ADDRESS",
      "MO_SUBSCRIPTION_LP_ADDRESS",
      "NEXT_PUBLIC_MO_LP_ADDRESS"
    ) ?? ZERO_ADDRESS;

  const monthlyFeeMoRaw =
    process.env.NEXT_PUBLIC_MO_SUBSCRIPTION_MONTHLY_FEE_MO ??
    process.env.MO_SUBSCRIPTION_MONTHLY_FEE_MO ??
    "50";
  const requiredMoBalanceRaw =
    process.env.NEXT_PUBLIC_TERMINAL_FULL_ACCESS_MIN_MO ??
    process.env.TERMINAL_FULL_ACCESS_MIN_MO ??
    "100000";
  const splitVaultBps = asPositiveInt(
    process.env.NEXT_PUBLIC_MO_SUBSCRIPTION_VAULT_BPS ??
      process.env.MO_SUBSCRIPTION_VAULT_BPS,
    5000
  );
  const normalizedVaultBps = Math.max(0, Math.min(10_000, splitVaultBps));
  const lookbackBlocks = asPositiveInt(
    process.env.MO_SUBSCRIPTION_LOOKBACK_BLOCKS ??
      process.env.NEXT_PUBLIC_MO_SUBSCRIPTION_LOOKBACK_BLOCKS,
    chainId === baseSepolia.id ? 500_000 : 1_500_000
  );
  const chunkSize = asPositiveInt(process.env.MO_SUBSCRIPTION_LOG_CHUNK_SIZE, 50_000);

  const monthlyFeeWei = parseUnits(monthlyFeeMoRaw, MO_TOKEN.decimals);
  const requiredMoBalanceWei = parseUnits(requiredMoBalanceRaw, MO_TOKEN.decimals);
  const hasVaultRecipient = vaultRecipient.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const hasLpRecipient = lpRecipient.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const enabled = true;

  let vaultWei = BigInt(0);
  let lpWei = BigInt(0);
  if (hasVaultRecipient && hasLpRecipient) {
    vaultWei = (monthlyFeeWei * BigInt(normalizedVaultBps)) / BigInt(10_000);
    lpWei = monthlyFeeWei - vaultWei;
  } else if (hasVaultRecipient) {
    vaultWei = monthlyFeeWei;
  } else if (hasLpRecipient) {
    lpWei = monthlyFeeWei;
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 12_000 }),
  });

  return {
    enabled,
    chainId,
    client,
    lookbackBlocks,
    chunkSize,
    monthlyFeeWei,
    monthlyFeeMoRaw,
    requiredMoBalanceRaw,
    requiredMoBalanceWei,
    vault: { recipient: vaultRecipient, requiredWei: vaultWei },
    lp: { recipient: lpRecipient, requiredWei: lpWei },
  };
}

async function getOutgoingTransfersThisMonth(
  address: Address
): Promise<Array<{ to: Address; value: bigint; txHash: string; timestamp: number }>> {
  const config = getSubscriptionConfig();
  if (!config.enabled) return [];

  const latest = await config.client.getBlockNumber();
  const fromBlock =
    latest > BigInt(config.lookbackBlocks) ? latest - BigInt(config.lookbackBlocks) : BigInt(0);
  const { startUnix } = monthBoundsUtc();

  const transfers: Array<{ to: Address; value: bigint; txHash: string; timestamp: number }> = [];
  const blockTimestampCache = new Map<string, number>();

  for (
    let start = fromBlock;
    start <= latest;
    start += BigInt(config.chunkSize)
  ) {
    const end = start + BigInt(config.chunkSize - 1) > latest
      ? latest
      : start + BigInt(config.chunkSize - 1);

    const logs = await config.client.getLogs({
      address: MO_TOKEN.address,
      event: TRANSFER_EVENT,
      args: { from: address },
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      if (!log.args.to || log.args.value === undefined || !log.blockNumber) continue;
      const blockKey = log.blockNumber.toString();
      let timestamp = blockTimestampCache.get(blockKey);
      if (!timestamp) {
        const block = await config.client.getBlock({ blockNumber: log.blockNumber });
        timestamp = Number(block.timestamp);
        blockTimestampCache.set(blockKey, timestamp);
      }
      if (timestamp < startUnix) continue;

      transfers.push({
        to: log.args.to as Address,
        value: log.args.value as bigint,
        txHash: log.transactionHash,
        timestamp,
      });
    }
  }

  return transfers;
}

export async function getTerminalSubscriptionStatus(
  address?: Address,
  options?: { forceRefresh?: boolean }
): Promise<TerminalSubscriptionStatus> {
  const config = getSubscriptionConfig();
  const { monthKey } = monthBoundsUtc();

  const cacheKey = `${monthKey}:${address ?? "anon"}`;
  if (!options?.forceRefresh) {
    const cached = statusCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status;
    }
  }

  const baseStatus: TerminalSubscriptionStatus = {
    enabled: config.enabled,
    accessMode: "holder-balance",
    chainId: config.chainId,
    monthKey,
    token: {
      address: MO_TOKEN.address,
      symbol: "MO",
      decimals: MO_TOKEN.decimals,
    },
    requiredMoBalance: config.requiredMoBalanceRaw,
    requiredWeiBalance: config.requiredMoBalanceWei.toString(),
    monthlyFeeMo: config.monthlyFeeMoRaw,
    monthlyFeeWei: config.monthlyFeeWei.toString(),
    splits: [],
  };

  if (!config.enabled) {
    const status = { ...baseStatus, reason: "terminal access gate is not configured" };
    statusCache.set(cacheKey, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
    return status;
  }

  if (!address || !isAddress(address)) {
    statusCache.set(cacheKey, { status: baseStatus, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
    return baseStatus;
  }

  const balanceWei = await config.client.readContract({
    address: MO_TOKEN.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  const unlocked = balanceWei >= config.requiredMoBalanceWei;

  const status: TerminalSubscriptionStatus = {
    ...baseStatus,
    account: {
      address,
      unlocked,
      balanceWei: balanceWei.toString(),
      balanceMo: formatMo(balanceWei),
      paidWeiTotal: balanceWei.toString(),
      paidMoTotal: formatMo(balanceWei),
      txHashes: [],
    },
  };

  statusCache.set(cacheKey, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
  return status;
}
