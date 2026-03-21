import "server-only";

import { createPublicClient, http } from "viem";
import { base, baseSepolia, mainnet } from "viem/chains";

const DEFAULT_BASE_MAINNET_RPC_URL = "https://mainnet.base.org";
const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const DEFAULT_ETHEREUM_MAINNET_RPC_URL = "https://mainnet.rpc.buidlguidl.com";

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readChainId(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

const baseContractsChainId =
  readChainId(process.env.CONTRACTS_CHAIN_ID, process.env.NEXT_PUBLIC_CONTRACTS_CHAIN_ID) ??
  base.id;
const predictionMarketChainId =
  readChainId(
    process.env.PREDICTION_MARKET_CHAIN_ID,
    process.env.NEXT_PUBLIC_PREDICTION_MARKET_CHAIN_ID,
  ) ?? mainnet.id;

const baseContractsChain = baseContractsChainId === baseSepolia.id ? baseSepolia : base;
const predictionMarketChain =
  predictionMarketChainId === baseSepolia.id
    ? baseSepolia
    : predictionMarketChainId === base.id
      ? base
      : mainnet;

export function getBaseContractsRpcUrl(): string {
  if (baseContractsChainId === baseSepolia.id) {
    return (
      firstDefined(
        process.env.BASE_SEPOLIA_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
        process.env.BASE_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_RPC_URL,
      ) ?? DEFAULT_BASE_SEPOLIA_RPC_URL
    );
  }

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
  if (predictionMarketChainId === baseSepolia.id) {
    return (
      firstDefined(
        process.env.BASE_SEPOLIA_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
        process.env.BASE_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_RPC_URL,
      ) ?? DEFAULT_BASE_SEPOLIA_RPC_URL
    );
  }

  if (predictionMarketChainId === base.id) {
    return (
      firstDefined(
        process.env.BASE_MAINNET_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL,
        process.env.BASE_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_RPC_URL,
      ) ?? DEFAULT_BASE_MAINNET_RPC_URL
    );
  }

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
  chain: baseContractsChain,
  transport: http(getBaseContractsRpcUrl(), { timeout: 10_000 }),
});

export const predictionMarketPublicClient = createPublicClient({
  chain: predictionMarketChain,
  transport: http(getPredictionMarketRpcUrl(), { timeout: 10_000 }),
});
