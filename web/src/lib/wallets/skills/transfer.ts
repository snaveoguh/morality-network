import { encodeFunctionData, isAddress, type Address } from "viem";
import type { SkillContext, SkillHandler, SkillResult } from "./types";

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

export interface TransferParams {
  /** ERC-20 token address; omit for native ETH. */
  token?: Address;
  to: Address;
  /** wei (or token base units) — decimal/numeric string accepted. */
  amount: bigint;
}

function requireAddress(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${name} must be an address`);
  }
  return value as Address;
}

function requireBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  throw new Error(`${name} must be a positive integer or numeric string`);
}

export const transferSkill: SkillHandler<TransferParams> = {
  name: "transfer",

  parse(raw): TransferParams {
    if (!raw || typeof raw !== "object") throw new Error("transfer params must be an object");
    const r = raw as Record<string, unknown>;
    const token = r.token === undefined || r.token === null
      ? undefined
      : requireAddress(r.token, "token");
    return {
      token,
      to: requireAddress(r.to, "to"),
      amount: requireBigInt(r.amount, "amount"),
    };
  },

  async run(ctx: SkillContext, params: TransferParams): Promise<SkillResult> {
    if (!params.token) {
      // Native ETH on Base.
      const txHash = await ctx.wallet.sendTx({
        to: params.to,
        value: params.amount,
      });
      return { txHash, meta: { asset: "ETH" } };
    }

    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [params.to, params.amount],
    });
    const txHash = await ctx.wallet.sendTx({
      to: params.token,
      data,
      value: BigInt(0),
    });
    return { txHash, meta: { asset: params.token } };
  },
};
