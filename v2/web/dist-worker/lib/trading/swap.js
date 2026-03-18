"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTokenDecimals = readTokenDecimals;
exports.ensureAllowance = ensureAllowance;
exports.executeSwap = executeSwap;
exports.waitForSuccess = waitForSuccess;
exports.estimateAmountOutMin = estimateAmountOutMin;
const abi_1 = require("./abi");
const gas_1 = require("./gas");
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const decimalsCache = new Map();
async function readTokenDecimals(publicClient, token) {
    const key = token.toLowerCase();
    const cached = decimalsCache.get(key);
    if (cached !== undefined)
        return cached;
    const decimals = await publicClient.readContract({
        address: token,
        abi: abi_1.ERC20_TRADE_ABI,
        functionName: "decimals",
    });
    const normalized = Number(decimals);
    decimalsCache.set(key, normalized);
    return normalized;
}
async function ensureAllowance(ctx, token, spender, amount) {
    const allowance = await ctx.publicClient.readContract({
        address: token,
        abi: abi_1.ERC20_TRADE_ABI,
        functionName: "allowance",
        args: [ctx.accountAddress, spender],
    });
    if (allowance >= amount)
        return;
    const fees = await (0, gas_1.fastFeeOverrides)(ctx.publicClient, ctx.config);
    const txHash = await ctx.walletClient.writeContract({
        account: ctx.accountAddress,
        address: token,
        abi: abi_1.ERC20_TRADE_ABI,
        functionName: "approve",
        args: [spender, MAX_UINT256],
        ...fees,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });
}
async function executeSwap(ctx, params) {
    if (params.dex === "uniswap-v3") {
        return swapUniswapV3(ctx, params);
    }
    return swapAerodrome(ctx, params);
}
async function swapUniswapV3(ctx, params) {
    if (ctx.config.uniswapV3Router.toLowerCase() === ZERO_ADDRESS) {
        throw new Error("UNISWAP_V3_ROUTER_ADDRESS not configured");
    }
    await ensureAllowance(ctx, params.tokenIn, ctx.config.uniswapV3Router, params.amountIn);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 90);
    const fees = await (0, gas_1.fastFeeOverrides)(ctx.publicClient, ctx.config);
    const txHash = await ctx.walletClient.writeContract({
        account: ctx.accountAddress,
        address: ctx.config.uniswapV3Router,
        abi: abi_1.UNISWAP_V3_ROUTER_ABI,
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
                sqrtPriceLimitX96: BigInt(0),
            },
        ],
        ...fees,
    });
    return txHash;
}
async function swapAerodrome(ctx, params) {
    if (ctx.config.aerodromeRouter.toLowerCase() === ZERO_ADDRESS) {
        throw new Error("AERODROME_ROUTER_ADDRESS not configured");
    }
    if (ctx.config.aerodromeFactory.toLowerCase() === ZERO_ADDRESS) {
        throw new Error("AERODROME_FACTORY_ADDRESS not configured");
    }
    await ensureAllowance(ctx, params.tokenIn, ctx.config.aerodromeRouter, params.amountIn);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 90);
    const fees = await (0, gas_1.fastFeeOverrides)(ctx.publicClient, ctx.config);
    const txHash = await ctx.walletClient.writeContract({
        account: ctx.accountAddress,
        address: ctx.config.aerodromeRouter,
        abi: abi_1.AERODROME_ROUTER_ABI,
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
async function waitForSuccess(publicClient, txHash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
        throw new Error(`swap tx failed: ${txHash}`);
    }
}
function estimateAmountOutMin(args) {
    const amountIn = Number(args.amountInRaw) / 10 ** args.quoteDecimals;
    const expectedOutFloat = (amountIn * args.quotePriceUsd) / args.tokenPriceUsd;
    const expectedOutRaw = Math.floor(expectedOutFloat * 10 ** args.tokenDecimals);
    if (!Number.isFinite(expectedOutRaw) || expectedOutRaw <= 0)
        return BigInt(0);
    const expectedOut = BigInt(expectedOutRaw);
    const min = (expectedOut * BigInt(10_000 - args.slippageBps)) / BigInt(10_000);
    return min > BigInt(0) ? min : BigInt(0);
}
