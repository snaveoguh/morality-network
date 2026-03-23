import type { TraderExecutionConfig } from "./types";

export interface FeeOverrides {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export async function fastFeeOverrides(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- viem PublicClient generics incompatible across chains
  publicClient: any,
  config: TraderExecutionConfig
): Promise<FeeOverrides> {
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const baseFeePerGas = latestBlock.baseFeePerGas ?? BigInt(0);

  const estimate = await publicClient.estimateFeesPerGas({ type: "eip1559" });

  const maxPriorityFeePerGas =
    estimate.maxPriorityFeePerGas && estimate.maxPriorityFeePerGas > config.maxPriorityFeePerGas
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
