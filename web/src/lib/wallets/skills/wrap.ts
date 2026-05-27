import { encodeFunctionData } from "viem";
import { BASE_ADDRESSES, type SkillContext, type SkillHandler, type SkillResult } from "./types";

const WETH_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
] as const;

export interface WrapParams {
  /** Mode — wrap ETH→WETH or unwrap WETH→ETH. */
  direction: "wrap" | "unwrap";
  /** Amount in wei. */
  amount: bigint;
}

function requireBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  throw new Error(`${name} must be a positive integer or numeric string`);
}

export const wrapSkill: SkillHandler<WrapParams> = {
  name: "wrap",

  parse(raw): WrapParams {
    if (!raw || typeof raw !== "object") throw new Error("wrap params must be an object");
    const r = raw as Record<string, unknown>;
    const direction = r.direction === "unwrap" ? "unwrap" : "wrap";
    return {
      direction,
      amount: requireBigInt(r.amount, "amount"),
    };
  },

  async run(ctx: SkillContext, params: WrapParams): Promise<SkillResult> {
    if (params.direction === "wrap") {
      const data = encodeFunctionData({ abi: WETH_ABI, functionName: "deposit" });
      const txHash = await ctx.wallet.sendTx({
        to: BASE_ADDRESSES.weth,
        data,
        value: params.amount,
      });
      return { txHash, meta: { direction: "wrap", amount: params.amount.toString() } };
    }
    const data = encodeFunctionData({
      abi: WETH_ABI,
      functionName: "withdraw",
      args: [params.amount],
    });
    const txHash = await ctx.wallet.sendTx({
      to: BASE_ADDRESSES.weth,
      data,
      value: BigInt(0),
    });
    return { txHash, meta: { direction: "unwrap", amount: params.amount.toString() } };
  },
};
