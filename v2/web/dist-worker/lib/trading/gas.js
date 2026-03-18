"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastFeeOverrides = fastFeeOverrides;
async function fastFeeOverrides(publicClient, config) {
    const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
    const baseFeePerGas = latestBlock.baseFeePerGas ?? BigInt(0);
    const estimate = await publicClient.estimateFeesPerGas({ type: "eip1559" });
    const maxPriorityFeePerGas = estimate.maxPriorityFeePerGas && estimate.maxPriorityFeePerGas > config.maxPriorityFeePerGas
        ? estimate.maxPriorityFeePerGas
        : config.maxPriorityFeePerGas;
    const baselineFee = estimate.maxFeePerGas && estimate.maxFeePerGas > BigInt(0)
        ? estimate.maxFeePerGas
        : baseFeePerGas + maxPriorityFeePerGas;
    const maxFeePerGas = (baselineFee * BigInt(config.gasMultiplierBps)) / BigInt(10_000);
    return {
        maxFeePerGas: maxFeePerGas > maxPriorityFeePerGas ? maxFeePerGas : maxPriorityFeePerGas + BigInt(1),
        maxPriorityFeePerGas,
    };
}
