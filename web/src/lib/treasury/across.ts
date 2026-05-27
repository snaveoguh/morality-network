// Across Protocol (intent-based bridge) — Arbitrum → Base USDC.
//
// API docs: https://docs.across.to/integration-guides/across-api
// Flow:
//   1. GET suggested-fees → returns relay fee + quoteTimestamp + outputAmount
//   2. ERC20 approve SpokePool to spend USDC on Arbitrum (one-time / unlimited)
//   3. Call SpokePool.depositV3(...) on Arbitrum
//   4. Across relayer fills on Base in ~10–60s, USDC lands at recipient

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ACROSS_API = "https://app.across.to/api";

// SpokePool addresses (Across V3)
export const ARBITRUM_SPOKE_POOL: Address = "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A";
export const BASE_SPOKE_POOL: Address = "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64";

// Bridged USDC addresses
export const ARBITRUM_USDC: Address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const BASE_USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const DEPOSIT_V3_ABI = [
  {
    type: "function",
    name: "depositV3",
    stateMutability: "payable",
    inputs: [
      { name: "depositor", type: "address" },
      { name: "recipient", type: "address" },
      { name: "inputToken", type: "address" },
      { name: "outputToken", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "exclusiveRelayer", type: "address" },
      { name: "quoteTimestamp", type: "uint32" },
      { name: "fillDeadline", type: "uint32" },
      { name: "exclusivityParameter", type: "uint32" },
      { name: "message", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

function operatorKey(): `0x${string}` {
  const raw = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error("AGENT_PRIVATE_KEY not set");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

function arbRpc(): string {
  return process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
}

interface SuggestedFeesResponse {
  totalRelayFee: { pct: string; total: string };
  lpFee: { pct: string; total: string };
  relayerCapitalFee?: { pct: string; total: string };
  outputAmount?: string;
  timestamp: string;
  fillDeadline?: string;
  exclusiveRelayer?: Address;
  exclusivityDeadline?: string;
}

export async function getAcrossQuote(args: {
  amountUsdcRaw: bigint; // 6-decimal USDC base units
}): Promise<{
  inputAmount: bigint;
  outputAmount: bigint;
  totalRelayFeeUsd: number;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusiveRelayer: Address;
  exclusivityParameter: number;
  raw: SuggestedFeesResponse;
}> {
  const params = new URLSearchParams({
    inputToken: ARBITRUM_USDC,
    outputToken: BASE_USDC,
    originChainId: String(arbitrum.id),
    destinationChainId: "8453",
    amount: args.amountUsdcRaw.toString(),
  });
  const url = `${ACROSS_API}/suggested-fees?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`across suggested-fees ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as SuggestedFeesResponse;
  const totalFee = BigInt(body.totalRelayFee.total);
  const outputAmount = body.outputAmount
    ? BigInt(body.outputAmount)
    : args.amountUsdcRaw - totalFee;
  const quoteTimestamp = Number(body.timestamp);
  const fillDeadline = body.fillDeadline
    ? Number(body.fillDeadline)
    : quoteTimestamp + 4 * 3600;
  const exclusiveRelayer =
    body.exclusiveRelayer ?? ("0x0000000000000000000000000000000000000000" as Address);
  const exclusivityParameter = body.exclusivityDeadline ? Number(body.exclusivityDeadline) : 0;

  return {
    inputAmount: args.amountUsdcRaw,
    outputAmount,
    totalRelayFeeUsd: Number(totalFee) / 1_000_000,
    quoteTimestamp,
    fillDeadline,
    exclusiveRelayer,
    exclusivityParameter,
    raw: body,
  };
}

export interface BridgeResult {
  status: "ok" | "dry-run";
  recipient: Address;
  inputAmount: string;
  outputAmount: string;
  feeUsd: number;
  approveTxHash?: Hex;
  depositTxHash?: Hex;
}

export async function executeArbToBaseBridge(args: {
  amountUsdcRaw: bigint;
  recipient?: Address; // defaults to operator EOA on Base (same address)
  dryRun?: boolean;
}): Promise<BridgeResult> {
  const wallet = privateKeyToAccount(operatorKey());
  const recipient = args.recipient ?? (wallet.address as Address);
  const quote = await getAcrossQuote({ amountUsdcRaw: args.amountUsdcRaw });

  if (args.dryRun) {
    return {
      status: "dry-run",
      recipient,
      inputAmount: quote.inputAmount.toString(),
      outputAmount: quote.outputAmount.toString(),
      feeUsd: quote.totalRelayFeeUsd,
    };
  }

  const publicClient = createPublicClient({ chain: arbitrum, transport: http(arbRpc()) });
  const walletClient = createWalletClient({
    account: wallet,
    chain: arbitrum,
    transport: http(arbRpc()),
  });

  // 1) Approve SpokePool if allowance is insufficient.
  const allowance = (await publicClient.readContract({
    address: ARBITRUM_USDC,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [wallet.address as Address, ARBITRUM_SPOKE_POOL],
  })) as bigint;

  let approveTxHash: Hex | undefined;
  if (allowance < args.amountUsdcRaw) {
    approveTxHash = await walletClient.writeContract({
      address: ARBITRUM_USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ARBITRUM_SPOKE_POOL, (BigInt(1) << BigInt(256)) - BigInt(1)],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
  }

  // 2) depositV3
  const depositTxHash = await walletClient.writeContract({
    address: ARBITRUM_SPOKE_POOL,
    abi: DEPOSIT_V3_ABI,
    functionName: "depositV3",
    args: [
      wallet.address as Address,
      recipient,
      ARBITRUM_USDC,
      BASE_USDC,
      quote.inputAmount,
      quote.outputAmount,
      BigInt(8453),
      quote.exclusiveRelayer,
      quote.quoteTimestamp,
      quote.fillDeadline,
      quote.exclusivityParameter,
      "0x",
    ],
  });

  return {
    status: "ok",
    recipient,
    inputAmount: quote.inputAmount.toString(),
    outputAmount: quote.outputAmount.toString(),
    feeUsd: quote.totalRelayFeeUsd,
    approveTxHash,
    depositTxHash,
  };
}

// Surface the prepared depositV3 calldata without sending — useful for the
// preview endpoint.
export function encodeDepositV3Calldata(args: {
  depositor: Address;
  recipient: Address;
  inputAmount: bigint;
  outputAmount: bigint;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusiveRelayer: Address;
  exclusivityParameter: number;
}): Hex {
  return encodeFunctionData({
    abi: DEPOSIT_V3_ABI,
    functionName: "depositV3",
    args: [
      args.depositor,
      args.recipient,
      ARBITRUM_USDC,
      BASE_USDC,
      args.inputAmount,
      args.outputAmount,
      BigInt(8453),
      args.exclusiveRelayer,
      args.quoteTimestamp,
      args.fillDeadline,
      args.exclusivityParameter,
      "0x",
    ],
  });
}
