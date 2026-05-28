// Distribute Base USDC from the operator EOA to each agent's smart wallet.
//
// Used after a treasury top-up (HL withdraw → Across bridge) to fan out
// working capital across agents. Allocations are explicit so the operator
// can split asymmetrically (e.g. 60% to a specialist scanner, 40% to a
// generalist trader).

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getAgentAddress } from "@/lib/wallets/factory";
import { isAgentId } from "@/lib/wallets/agent-ids";
import { BASE_USDC } from "./across";
import {
  getTreasurySafeAddress,
  safeBatchTransfer,
  treasurySafeConfigured,
} from "./safe";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function operatorKey(): `0x${string}` {
  const raw = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error("AGENT_PRIVATE_KEY not set");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

function baseRpc(): string {
  return process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
}

export interface Allocation {
  agentId: string;
  /** USDC base units (6 decimals). */
  amountRaw: bigint;
}

export interface ResolvedAllocation extends Allocation {
  scwAddress: Address;
}

export async function resolveAllocations(allocations: Allocation[]): Promise<ResolvedAllocation[]> {
  const out: ResolvedAllocation[] = [];
  for (const a of allocations) {
    if (!isAgentId(a.agentId)) throw new Error(`unknown agent: ${a.agentId}`);
    if (a.amountRaw <= BigInt(0)) throw new Error(`amount must be positive for ${a.agentId}`);
    const scw = await getAgentAddress(a.agentId);
    out.push({ ...a, scwAddress: scw });
  }
  return out;
}

export interface DistributeResult {
  status: "ok" | "dry-run";
  operator: Address;
  baseUsdc: Address;
  transfers: Array<{
    agentId: string;
    scwAddress: Address;
    amountRaw: string;
    txHash?: Hex;
  }>;
  operatorBalanceBeforeRaw: string;
  totalDistributedRaw: string;
}

export async function executeDistribution(args: {
  allocations: Allocation[];
  dryRun?: boolean;
}): Promise<DistributeResult> {
  const wallet = privateKeyToAccount(operatorKey());
  const resolved = await resolveAllocations(args.allocations);
  const total = resolved.reduce((s, a) => s + a.amountRaw, BigInt(0));

  const publicClient = createPublicClient({ chain: base, transport: http(baseRpc()) });
  const balance = (await publicClient.readContract({
    address: BASE_USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [wallet.address as Address],
  })) as bigint;

  if (balance < total) {
    throw new Error(
      `insufficient operator USDC on Base: have ${balance}, need ${total}`,
    );
  }

  if (args.dryRun) {
    return {
      status: "dry-run",
      operator: wallet.address as Address,
      baseUsdc: BASE_USDC,
      transfers: resolved.map((a) => ({
        agentId: a.agentId,
        scwAddress: a.scwAddress,
        amountRaw: a.amountRaw.toString(),
      })),
      operatorBalanceBeforeRaw: balance.toString(),
      totalDistributedRaw: total.toString(),
    };
  }

  const walletClient = createWalletClient({
    account: wallet,
    chain: base,
    transport: http(baseRpc()),
  });

  const transfers: DistributeResult["transfers"] = [];
  for (const a of resolved) {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [a.scwAddress, a.amountRaw],
    });
    const txHash = await walletClient.sendTransaction({
      to: BASE_USDC,
      data,
      value: BigInt(0),
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    transfers.push({
      agentId: a.agentId,
      scwAddress: a.scwAddress,
      amountRaw: a.amountRaw.toString(),
      txHash,
    });
  }

  return {
    status: "ok",
    operator: wallet.address as Address,
    baseUsdc: BASE_USDC,
    transfers,
    operatorBalanceBeforeRaw: balance.toString(),
    totalDistributedRaw: total.toString(),
  };
}

// ---------------------------------------------------------------------------
// Safe-routed distribution (Zodiac integration memo §6 / Week 1).
//
// Funds live in the Treasury Safe; the operator EOA is the sole signer and
// authorises a single Safe transaction containing N ERC20 transfers (one per
// agent). One on-chain tx, one signature, vs. N separate operator-EOA
// transfers in the legacy path. Agent-side behaviour is unchanged — funds
// land at the same SCW addresses.
//
// Use this once TREASURY_SAFE_ADDRESS_BASE is set in the environment and
// the Safe has been funded (USDC + a small amount of ETH for gas isn't
// required — the operator EOA pays gas, the Safe just holds the USDC).
// ---------------------------------------------------------------------------

export interface SafeDistributeResult {
  status: "ok" | "dry-run";
  source: "safe";
  safeAddress: Address;
  operator: Address;
  baseUsdc: Address;
  transfers: Array<{
    agentId: string;
    scwAddress: Address;
    amountRaw: string;
  }>;
  safeBalanceBeforeRaw: string;
  totalDistributedRaw: string;
  txHash?: Hex;
}

export async function executeSafeDistribution(args: {
  allocations: Allocation[];
  dryRun?: boolean;
}): Promise<SafeDistributeResult> {
  if (!treasurySafeConfigured()) {
    throw new Error(
      "TREASURY_SAFE_ADDRESS_BASE not set — Safe path not available. " +
        "Either configure the env var (after running scripts/deploy_treasury_safe.mjs) " +
        "or fall back to executeDistribution() for the legacy operator-EOA path.",
    );
  }

  const wallet = privateKeyToAccount(operatorKey());
  const safeAddress = getTreasurySafeAddress();
  const resolved = await resolveAllocations(args.allocations);
  const total = resolved.reduce((s, a) => s + a.amountRaw, BigInt(0));

  const publicClient = createPublicClient({ chain: base, transport: http(baseRpc()) });
  const safeBalance = (await publicClient.readContract({
    address: BASE_USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [safeAddress],
  })) as bigint;

  if (safeBalance < total) {
    throw new Error(
      `insufficient Safe USDC on Base: Safe ${safeAddress} has ${safeBalance}, need ${total}`,
    );
  }

  if (args.dryRun) {
    return {
      status: "dry-run",
      source: "safe",
      safeAddress,
      operator: wallet.address as Address,
      baseUsdc: BASE_USDC,
      transfers: resolved.map((a) => ({
        agentId: a.agentId,
        scwAddress: a.scwAddress,
        amountRaw: a.amountRaw.toString(),
      })),
      safeBalanceBeforeRaw: safeBalance.toString(),
      totalDistributedRaw: total.toString(),
    };
  }

  const batch = await safeBatchTransfer({
    transfers: resolved.map((a) => ({ to: a.scwAddress, amountRaw: a.amountRaw })),
    token: BASE_USDC,
  });

  return {
    status: "ok",
    source: "safe",
    safeAddress,
    operator: wallet.address as Address,
    baseUsdc: BASE_USDC,
    transfers: resolved.map((a) => ({
      agentId: a.agentId,
      scwAddress: a.scwAddress,
      amountRaw: a.amountRaw.toString(),
    })),
    safeBalanceBeforeRaw: safeBalance.toString(),
    totalDistributedRaw: total.toString(),
    txHash: batch.txHash,
  };
}
