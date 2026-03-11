import type { Address } from "viem";

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  quoteToken?: { symbol?: string; address?: string };
  baseToken?: { symbol?: string; address?: string };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

export interface TokenMarketSnapshot {
  tokenAddress: Address;
  priceUsd: number | null;
  pairAddress: Address | null;
  quoteSymbol: string | null;
  liquidityUsd: number | null;
}

export type DexScreenerChainId = "base" | "ethereum";

export async function fetchTokenMarketSnapshot(
  tokenAddress: Address,
  options?: { timeoutMs?: number; chainId?: DexScreenerChainId }
): Promise<TokenMarketSnapshot> {
  const timeoutMs = options?.timeoutMs ?? 8_000;
  const chainId = options?.chainId ?? "base";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        tokenAddress,
        priceUsd: null,
        pairAddress: null,
        quoteSymbol: null,
        liquidityUsd: null,
      };
    }

    const json = (await res.json()) as DexScreenerResponse;
    const chainPairs = (json.pairs ?? []).filter((pair) => pair.chainId === chainId);
    const best = chainPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    if (!best) {
      return {
        tokenAddress,
        priceUsd: null,
        pairAddress: null,
        quoteSymbol: null,
        liquidityUsd: null,
      };
    }

    const parsedPrice = Number(best.priceUsd ?? "");
    const normalizedPrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;

    return {
      tokenAddress,
      priceUsd: normalizedPrice,
      pairAddress: best.pairAddress ? (best.pairAddress as Address) : null,
      quoteSymbol: best.quoteToken?.symbol?.toUpperCase() ?? null,
      liquidityUsd: best.liquidity?.usd ?? null,
    };
  } catch {
    return {
      tokenAddress,
      priceUsd: null,
      pairAddress: null,
      quoteSymbol: null,
      liquidityUsd: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeQuoteSymbol(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.includes("USDC")) return "USDC";
  if (upper.includes("WETH") || upper === "ETH") return "WETH";
  if (upper.includes("CBETH")) return "WETH";
  if (upper.includes("USDBC")) return "USDC";
  if (upper.includes("DAI")) return "USDC";
  return null;
}
