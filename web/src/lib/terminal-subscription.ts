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
import { MO_TOKEN, ZERO_ADDRESS } from "@/lib/contracts";

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
  chainId: number;
  monthKey: string;
  token: {
    address: Address;
    symbol: "MO";
    decimals: number;
  };
  monthlyFeeMo: string;
  monthlyFeeWei: string;
  splits: TerminalSubscriptionSplit[];
  account?: {
    address: Address;
    unlocked: boolean;
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
  return formatted.replace(/\.?0+$/, "") || "0";
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
  const hasVaultRecipient = vaultRecipient.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const hasLpRecipient = lpRecipient.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const enabled = hasVaultRecipient || hasLpRecipient;

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
    chainId: config.chainId,
    monthKey,
    token: {
      address: MO_TOKEN.address,
      symbol: "MO",
      decimals: MO_TOKEN.decimals,
    },
    monthlyFeeMo: config.monthlyFeeMoRaw,
    monthlyFeeWei: config.monthlyFeeWei.toString(),
    splits: [
      {
        key: "vault",
        recipient: config.vault.recipient,
        requiredWei: config.vault.requiredWei.toString(),
        requiredMo: formatMo(config.vault.requiredWei),
        paidWei: "0",
        paidMo: "0",
        remainingWei: config.vault.requiredWei.toString(),
        remainingMo: formatMo(config.vault.requiredWei),
      },
      {
        key: "lp",
        recipient: config.lp.recipient,
        requiredWei: config.lp.requiredWei.toString(),
        requiredMo: formatMo(config.lp.requiredWei),
        paidWei: "0",
        paidMo: "0",
        remainingWei: config.lp.requiredWei.toString(),
        remainingMo: formatMo(config.lp.requiredWei),
      },
    ],
  };

  if (!config.enabled) {
    const status = { ...baseStatus, reason: "subscription recipients are not configured" };
    statusCache.set(cacheKey, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
    return status;
  }

  if (!address || !isAddress(address)) {
    statusCache.set(cacheKey, { status: baseStatus, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
    return baseStatus;
  }

  const outgoing = await getOutgoingTransfersThisMonth(address);
  let paidVault = BigInt(0);
  let paidLp = BigInt(0);
  const txHashes: string[] = [];

  for (const transfer of outgoing) {
    if (transfer.to.toLowerCase() === config.vault.recipient.toLowerCase()) {
      paidVault += transfer.value;
      txHashes.push(transfer.txHash);
      continue;
    }
    if (transfer.to.toLowerCase() === config.lp.recipient.toLowerCase()) {
      paidLp += transfer.value;
      txHashes.push(transfer.txHash);
    }
  }

  const remainingVault = config.vault.requiredWei > paidVault ? config.vault.requiredWei - paidVault : BigInt(0);
  const remainingLp = config.lp.requiredWei > paidLp ? config.lp.requiredWei - paidLp : BigInt(0);
  const unlocked = remainingVault === BigInt(0) && remainingLp === BigInt(0);

  const status: TerminalSubscriptionStatus = {
    ...baseStatus,
    splits: [
      {
        ...baseStatus.splits[0],
        paidWei: paidVault.toString(),
        paidMo: formatMo(paidVault),
        remainingWei: remainingVault.toString(),
        remainingMo: formatMo(remainingVault),
      },
      {
        ...baseStatus.splits[1],
        paidWei: paidLp.toString(),
        paidMo: formatMo(paidLp),
        remainingWei: remainingLp.toString(),
        remainingMo: formatMo(remainingLp),
      },
    ],
    account: {
      address,
      unlocked,
      paidWeiTotal: (paidVault + paidLp).toString(),
      paidMoTotal: formatMo(paidVault + paidLp),
      txHashes: Array.from(new Set(txHashes)).slice(0, 20),
    },
  };

  statusCache.set(cacheKey, { status, expiresAt: Date.now() + STATUS_CACHE_TTL_MS });
  return status;
}
