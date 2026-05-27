import { encodeFunctionData, isAddress, type Address, type Hex } from "viem";
import { basePublicClient } from "../clients";
import {
  AERODROME_ROUTER_ABI,
  ERC20_TRADE_ABI,
  UNISWAP_V3_ROUTER_ABI,
} from "@/lib/trading/abi";
import { BASE_ADDRESSES, type SkillContext, type SkillHandler, type SkillResult } from "./types";

const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMin: bigint;
  dex: "uniswap-v3" | "aerodrome";
  poolFee?: number; // uniswap-v3 only; default 3000 (0.3%)
  stable?: boolean; // aerodrome only; default false
}

function requireBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  throw new Error(`${name} must be a positive integer or numeric string`);
}

function requireAddress(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${name} must be an address`);
  }
  return value as Address;
}

export const swapSkill: SkillHandler<SwapParams> = {
  name: "swap",

  parse(raw): SwapParams {
    if (!raw || typeof raw !== "object") throw new Error("swap params must be an object");
    const r = raw as Record<string, unknown>;
    const dex = r.dex === "aerodrome" ? "aerodrome" : "uniswap-v3";
    return {
      tokenIn: requireAddress(r.tokenIn, "tokenIn"),
      tokenOut: requireAddress(r.tokenOut, "tokenOut"),
      amountIn: requireBigInt(r.amountIn, "amountIn"),
      amountOutMin: requireBigInt(r.amountOutMin ?? "0", "amountOutMin"),
      dex,
      poolFee: typeof r.poolFee === "number" ? r.poolFee : 3000,
      stable: r.stable === true,
    };
  },

  async run(ctx: SkillContext, params: SwapParams): Promise<SkillResult> {
    const router =
      params.dex === "aerodrome"
        ? BASE_ADDRESSES.aerodromeRouter
        : BASE_ADDRESSES.uniswapV3Router;

    const extra: Hex[] = [];

    // 1) Approve if allowance is insufficient. Native ETH (handled by wrap
    // skill separately) is not supported here — the caller must supply WETH
    // or an ERC20.
    const allowance = await basePublicClient().readContract({
      address: params.tokenIn,
      abi: ERC20_TRADE_ABI,
      functionName: "allowance",
      args: [ctx.wallet.address, router],
    });

    if ((allowance as bigint) < params.amountIn) {
      const approveData = encodeFunctionData({
        abi: ERC20_TRADE_ABI,
        functionName: "approve",
        args: [router, MAX_UINT256],
      });
      const approveHash = await ctx.wallet.sendTx({
        to: params.tokenIn,
        data: approveData,
        value: BigInt(0),
      });
      extra.push(approveHash);
    }

    // 2) Submit the swap.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 180);
    let swapData: Hex;
    if (params.dex === "uniswap-v3") {
      swapData = encodeFunctionData({
        abi: UNISWAP_V3_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            fee: params.poolFee ?? 3000,
            recipient: ctx.wallet.address,
            deadline,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMin,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });
    } else {
      swapData = encodeFunctionData({
        abi: AERODROME_ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [
          params.amountIn,
          params.amountOutMin,
          [
            {
              from: params.tokenIn,
              to: params.tokenOut,
              stable: !!params.stable,
              factory: BASE_ADDRESSES.aerodromeFactory,
            },
          ],
          ctx.wallet.address,
          deadline,
        ],
      });
    }

    const txHash = await ctx.wallet.sendTx({ to: router, data: swapData, value: BigInt(0) });

    return {
      txHash,
      extraTxHashes: extra.length ? extra : undefined,
      meta: { dex: params.dex, router, tokenIn: params.tokenIn, tokenOut: params.tokenOut },
    };
  },
};
