import { base, baseSepolia, mainnet } from "viem/chains";

const LEGACY_ETH_MAINNET_RPC_HOSTS = [
  "mainnet.rpc.buidlguidl.com",
  "eth.llamarpc.com",
  "ethereum.publicnode.com",
  "ethereum-rpc.publicnode.com",
  "rpc.ankr.com",
  "eth-mainnet.public.blastapi.io",
];

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function hostLooksLegacyPublicRpc(url: string): boolean {
  return LEGACY_ETH_MAINNET_RPC_HOSTS.some((host) => url.includes(host));
}

function getInfuraMainnetUrl(): string | undefined {
  const key = firstDefined(process.env.INFURA_KEY, process.env.NEXT_PUBLIC_INFURA_KEY);
  return key ? `https://mainnet.infura.io/v3/${key}` : undefined;
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

export function getEthereumMainnetRpcUrl(): string {
  const configured = firstDefined(
    process.env.ETHEREUM_MAINNET_RPC_URL,
    process.env.NEXT_PUBLIC_ETHEREUM_MAINNET_RPC_URL,
    process.env.ETHEREUM_RPC_URL,
    process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
    process.env.MAINNET_RPC_URL,
    process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  );

  const infura = getInfuraMainnetUrl();
  if (configured) {
    if (hostLooksLegacyPublicRpc(configured) && infura) return infura;
    return configured;
  }

  return infura ?? "https://mainnet.rpc.buidlguidl.com";
}

export function getPredictionMarketChainId(): number {
  return readChainId(
    process.env.PREDICTION_MARKET_CHAIN_ID,
    process.env.NEXT_PUBLIC_PREDICTION_MARKET_CHAIN_ID,
  ) ?? mainnet.id;
}

export function getPredictionMarketChain() {
  const chainId = getPredictionMarketChainId();
  if (chainId === baseSepolia.id) return baseSepolia;
  if (chainId === base.id) return base;
  return mainnet;
}

export function getPredictionMarketRpcUrl(): string {
  const chainId = getPredictionMarketChainId();

  if (chainId === baseSepolia.id) {
    return (
      firstDefined(
        process.env.BASE_SEPOLIA_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
        process.env.BASE_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_RPC_URL,
      ) ?? "https://sepolia.base.org"
    );
  }

  if (chainId === base.id) {
    return (
      firstDefined(
        process.env.BASE_MAINNET_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL,
        process.env.BASE_RPC_URL,
        process.env.NEXT_PUBLIC_BASE_RPC_URL,
      ) ?? "https://mainnet.base.org"
    );
  }

  return getEthereumMainnetRpcUrl();
}
