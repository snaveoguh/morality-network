import "server-only";

import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";

const DEFAULT_BASE_MAINNET_RPC_URL = "https://mainnet.base.org";
const DEFAULT_ETHEREUM_MAINNET_RPC_URL = "https://mainnet.rpc.buidlguidl.com";

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function getBaseContractsRpcUrl(): string {
  return (
    firstDefined(
      process.env.BASE_MAINNET_RPC_URL,
      process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL,
      process.env.BASE_RPC_URL,
      process.env.NEXT_PUBLIC_BASE_RPC_URL,
    ) ?? DEFAULT_BASE_MAINNET_RPC_URL
  );
}

export function getPredictionMarketRpcUrl(): string {
  return (
    firstDefined(
      process.env.ETHEREUM_MAINNET_RPC_URL,
      process.env.NEXT_PUBLIC_ETHEREUM_MAINNET_RPC_URL,
      process.env.ETHEREUM_RPC_URL,
      process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
      process.env.MAINNET_RPC_URL,
      process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
    ) ?? DEFAULT_ETHEREUM_MAINNET_RPC_URL
  );
}

export const baseContractsPublicClient = createPublicClient({
  chain: base,
  transport: http(getBaseContractsRpcUrl(), { timeout: 10_000 }),
});

export const predictionMarketPublicClient = createPublicClient({
  chain: mainnet,
  transport: http(getPredictionMarketRpcUrl(), { timeout: 10_000 }),
});
