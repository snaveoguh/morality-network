// Treasury Safe — runtime wrapper around @safe-global/protocol-kit.
//
// The Treasury Safe is the central vault that sits between the bridged
// USDC inflow and the per-agent Kernel SCWs. For now it's 1-of-1 with the
// operator EOA as sole signer; threshold can be raised later via a Safe
// owner-management tx (no code changes here).
//
// Required env vars when this module is used at runtime:
//   AGENT_PRIVATE_KEY (or PRIVATE_KEY)   operator EOA, sole Safe owner
//   BASE_MAINNET_RPC_URL                 Base RPC for connecting
//   TREASURY_SAFE_ADDRESS_BASE           deployed Safe address (set after first deploy)
//
// The Safe address itself is written into
// contracts/deployments/treasury-safe-<network>.json by the deploy script;
// you then mirror that value into the env var above.

import Safe from "@safe-global/protocol-kit";
import { encodeFunctionData, type Address, type Hash } from "viem";

import { BASE_USDC } from "./across";

const ERC20_TRANSFER_ABI = [
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

function getOperatorKey(): `0x${string}` {
  const raw = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!raw) throw new Error("AGENT_PRIVATE_KEY not set");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

function getBaseRpc(): string {
  return process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
}

export function getTreasurySafeAddress(): Address {
  const raw = process.env.TREASURY_SAFE_ADDRESS_BASE;
  if (!raw) {
    throw new Error(
      "TREASURY_SAFE_ADDRESS_BASE not set — deploy first via scripts/deploy_treasury_safe.mjs",
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error("TREASURY_SAFE_ADDRESS_BASE must be a 0x-prefixed 20-byte address");
  }
  return raw as Address;
}

export function treasurySafeConfigured(): boolean {
  return Boolean(process.env.TREASURY_SAFE_ADDRESS_BASE);
}

/**
 * Connect to the deployed Treasury Safe on Base mainnet with the operator
 * EOA as signer. Throws if env is incomplete or the Safe doesn't exist
 * onchain at the configured address.
 */
export async function connectTreasurySafe(): Promise<Safe> {
  const safeAddress = getTreasurySafeAddress();
  const safe = await Safe.init({
    provider: getBaseRpc(),
    signer: getOperatorKey(),
    safeAddress,
  });
  return safe;
}

export interface BatchTransfer {
  /** Recipient address (an agent's Kernel SCW). */
  to: Address;
  /** Amount in raw token base units. */
  amountRaw: bigint;
}

export interface SafeBatchResult {
  status: "ok" | "dry-run";
  safeAddress: Address;
  token: Address;
  totalRaw: string;
  txHash?: Hash;
  transfers: BatchTransfer[];
}

/**
 * Distribute a single ERC20 (USDC by default) to many recipients in one
 * Safe transaction (multiSend). Signed by the operator (sole owner), then
 * executed by the same operator. Result is a single onchain tx hash.
 *
 * Mirrors the shape of executeDistribution() in distribute.ts but routes
 * funds *from* the Safe instead of the operator EOA.
 */
export async function safeBatchTransfer(args: {
  transfers: BatchTransfer[];
  token?: Address;
  dryRun?: boolean;
}): Promise<SafeBatchResult> {
  const token = args.token ?? BASE_USDC;
  const safe = await connectTreasurySafe();
  const safeAddress = (await safe.getAddress()) as Address;

  if (args.transfers.length === 0) {
    throw new Error("no transfers requested");
  }

  const totalRaw = args.transfers.reduce(
    (acc, t) => acc + t.amountRaw,
    BigInt(0),
  );

  if (args.dryRun) {
    return {
      status: "dry-run",
      safeAddress,
      token,
      totalRaw: totalRaw.toString(),
      transfers: args.transfers,
    };
  }

  const safeTransactionData = args.transfers.map((t) => ({
    to: token,
    value: "0",
    data: encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [t.to, t.amountRaw],
    }),
  }));

  const tx = await safe.createTransaction({ transactions: safeTransactionData });
  const signedTx = await safe.signTransaction(tx);
  const executeResult = await safe.executeTransaction(signedTx);
  const txHash = executeResult.hash as Hash;

  return {
    status: "ok",
    safeAddress,
    token,
    totalRaw: totalRaw.toString(),
    txHash,
    transfers: args.transfers,
  };
}
