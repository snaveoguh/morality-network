import type { TraderExecutionConfig } from "./types";

export interface FeeOverrides {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export async function fastFeeOverrides(
  publicClient: any,
  config: TraderExecutionConfig
): Promise<FeeOverrides> {
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const baseFeePerGas = latestBlock.baseFeePerGas ?? 0n;

  const estimate = await publicClient.estimateFeesPerGas({ type: "eip1559" });

  const maxPriorityFeePerGas =
    estimate.maxPriorityFeePerGas && estimate.maxPriorityFeePerGas > config.maxPriorityFeePerGas
      ? estimate.maxPriorityFeePerGas
      : config.maxPriorityFeePerGas;

  const baselineFee = estimate.maxFeePerGas && estimate.maxFeePerGas > 0n
    ? estimate.maxFeePerGas
    : baseFeePerGas + maxPriorityFeePerGas;

  const maxFeePerGas = (baselineFee * BigInt(config.gasMultiplierBps)) / 10_000n;

  return {
    maxFeePerGas: maxFeePerGas > maxPriorityFeePerGas ? maxFeePerGas : maxPriorityFeePerGas + 1n,
    maxPriorityFeePerGas,
  };
}
