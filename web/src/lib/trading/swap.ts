import type { Address, Hash } from "viem";
import { AERODROME_ROUTER_ABI, ERC20_TRADE_ABI, UNISWAP_V3_ROUTER_ABI } from "./abi";
import { fastFeeOverrides } from "./gas";
import type { DexKind, TraderExecutionConfig } from "./types";

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const decimalsCache = new Map<string, number>();

export interface SwapContext {
  publicClient: any;
  walletClient: any;
  accountAddress: Address;
  config: TraderExecutionConfig;
}

export interface SwapParams {
  dex: DexKind;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMin: bigint;
}

export async function readTokenDecimals(
  publicClient: any,
  token: Address
): Promise<number> {
  const key = token.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;

  const decimals = await publicClient.readContract({
    address: token,
    abi: ERC20_TRADE_ABI,
    functionName: "decimals",
  });
  const normalized = Number(decimals);
  decimalsCache.set(key, normalized);
  return normalized;
}

export async function ensureAllowance(
  ctx: SwapContext,
  token: Address,
  spender: Address,
  amount: bigint
): Promise<void> {
  const allowance = await ctx.publicClient.readContract({
    address: token,
    abi: ERC20_TRADE_ABI,
    functionName: "allowance",
    args: [ctx.accountAddress, spender],
  });

  if (allowance >= amount) return;

  const fees = await fastFeeOverrides(ctx.publicClient, ctx.config);
  const txHash = await ctx.walletClient.writeContract({
    account: ctx.accountAddress,
    address: token,
    abi: ERC20_TRADE_ABI,
    functionName: "approve",
    args: [spender, MAX_UINT256],
    ...fees,
  });
  await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
}

export async function executeSwap(ctx: SwapContext, params: SwapParams): Promise<Hash> {
  if (params.dex === "uniswap-v3") {
    return swapUniswapV3(ctx, params);
  }
  return swapAerodrome(ctx, params);
}

async function swapUniswapV3(ctx: SwapContext, params: SwapParams): Promise<Hash> {
  if (ctx.config.uniswapV3Router.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("UNISWAP_V3_ROUTER_ADDRESS not configured");
  }

  await ensureAllowance(ctx, params.tokenIn, ctx.config.uniswapV3Router, params.amountIn);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 90);
  const fees = await fastFeeOverrides(ctx.publicClient, ctx.config);

  const txHash = await ctx.walletClient.writeContract({
    account: ctx.accountAddress,
    address: ctx.config.uniswapV3Router,
    abi: UNISWAP_V3_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: ctx.config.uniswapV3PoolFee,
        recipient: ctx.accountAddress,
        deadline,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
    ...fees,
  });

  return txHash;
}

async function swapAerodrome(ctx: SwapContext, params: SwapParams): Promise<Hash> {
  if (ctx.config.aerodromeRouter.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("AERODROME_ROUTER_ADDRESS not configured");
  }
  if (ctx.config.aerodromeFactory.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("AERODROME_FACTORY_ADDRESS not configured");
  }

  await ensureAllowance(ctx, params.tokenIn, ctx.config.aerodromeRouter, params.amountIn);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 90);
  const fees = await fastFeeOverrides(ctx.publicClient, ctx.config);

  const txHash = await ctx.walletClient.writeContract({
    account: ctx.accountAddress,
    address: ctx.config.aerodromeRouter,
    abi: AERODROME_ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [
      params.amountIn,
      params.amountOutMin,
      [
        {
          from: params.tokenIn,
          to: params.tokenOut,
          stable: false,
          factory: ctx.config.aerodromeFactory,
        },
      ],
      ctx.accountAddress,
      deadline,
    ],
    ...fees,
  });

  return txHash;
}

export async function waitForSuccess(publicClient: any, txHash: Hash): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`swap tx failed: ${txHash}`);
  }
}

export function estimateAmountOutMin(args: {
  amountInRaw: bigint;
  quoteDecimals: number;
  tokenDecimals: number;
  quotePriceUsd: number;
  tokenPriceUsd: number;
  slippageBps: number;
}): bigint {
  const amountIn = Number(args.amountInRaw) / 10 ** args.quoteDecimals;
  const expectedOutFloat = (amountIn * args.quotePriceUsd) / args.tokenPriceUsd;
  const expectedOutRaw = Math.floor(expectedOutFloat * 10 ** args.tokenDecimals);
  if (!Number.isFinite(expectedOutRaw) || expectedOutRaw <= 0) return 0n;

  const expectedOut = BigInt(expectedOutRaw);
  const min = (expectedOut * BigInt(10_000 - args.slippageBps)) / 10_000n;
  return min > 0n ? min : 0n;
}
