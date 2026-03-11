"use client";

import { useCallback, useEffect, useState } from "react";

const MO_TOKEN_ADDRESS = "0x8729c70061739140ee6bE00A3875Cbf6d09A746C";
const MARKETS_API = "/api/markets";
const POLL_MS = 60_000;

interface Quote {
  symbol: "MO" | "ETH" | "ZEC" | "BTC" | "MOG";
  price: number | null;
  change24h: number | null;
  href: string;
}

const FALLBACK_QUOTES: Quote[] = [
  {
    symbol: "MO",
    price: null,
    change24h: null,
    href: `https://dexscreener.com/base/${MO_TOKEN_ADDRESS}`,
  },
  {
    symbol: "ETH",
    price: null,
    change24h: null,
    href: "https://www.coingecko.com/en/coins/ethereum",
  },
  {
    symbol: "ZEC",
    price: null,
    change24h: null,
    href: "https://www.coingecko.com/en/coins/zcash",
  },
  {
    symbol: "BTC",
    price: null,
    change24h: null,
    href: "https://www.coingecko.com/en/coins/bitcoin",
  },
  {
    symbol: "MOG",
    price: null,
    change24h: null,
    href: "https://www.coingecko.com/en/coins/mog-coin",
  },
];

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatUsd(price: number | null): string {
  if (price === null) return "--";
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function formatChange(change: number | null): string {
  if (change === null) return "--";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

export function MarqueeBanner() {
  const [quotes, setQuotes] = useState<Quote[]>(FALLBACK_QUOTES);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch(MARKETS_API, { cache: "no-store" });
      if (!res.ok) return;

      const data = (await res.json()) as {
        coingecko: Record<string, { usd?: number; usd_24h_change?: number }> | null;
        dexscreener: {
          pairs?: Array<{
            chainId?: string;
            priceUsd?: string;
            url?: string;
            liquidity?: { usd?: number };
            priceChange?: { h24?: number };
          }>;
        } | null;
      };

      let next = [...FALLBACK_QUOTES];

      if (data.coingecko) {
        const cg = data.coingecko;
        next = next.map((q) => {
          if (q.symbol === "BTC") {
            return { ...q, price: asNumber(cg.bitcoin?.usd), change24h: asNumber(cg.bitcoin?.usd_24h_change) };
          }
          if (q.symbol === "ETH") {
            return { ...q, price: asNumber(cg.ethereum?.usd), change24h: asNumber(cg.ethereum?.usd_24h_change) };
          }
          if (q.symbol === "ZEC") {
            return { ...q, price: asNumber(cg.zcash?.usd), change24h: asNumber(cg.zcash?.usd_24h_change) };
          }
          if (q.symbol === "MOG") {
            return { ...q, price: asNumber(cg["mog-coin"]?.usd), change24h: asNumber(cg["mog-coin"]?.usd_24h_change) };
          }
          return q;
        });
      }

      if (data.dexscreener) {
        const basePairs = (data.dexscreener.pairs ?? [])
          .filter((pair) => String(pair.chainId ?? "").toLowerCase() === "base")
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
        const bestPair = basePairs[0];
        if (bestPair) {
          next = next.map((q) =>
            q.symbol === "MO"
              ? {
                  ...q,
                  price: asNumber(bestPair.priceUsd),
                  change24h: asNumber(bestPair.priceChange?.h24),
                  href: bestPair.url || `https://dexscreener.com/base/${MO_TOKEN_ADDRESS}`,
                }
              : q,
          );
        }
      }

      setQuotes(next);
    } catch (error) {
      console.error("[markets] ticker fetch failed", error);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const timer = setInterval(fetchQuotes, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchQuotes]);

  return (
    <div className="relative overflow-hidden bg-[var(--paper-dark)] py-1">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4">
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
          Markets
        </span>
        <div className="overflow-hidden">
          <div className="animate-marquee whitespace-nowrap">
            {Array.from({ length: 2 }).map((_, loop) => (
              <span
                key={`loop-${loop}`}
                className="mx-6 inline-block font-mono text-[10px] uppercase tracking-[0.16em]"
              >
                {quotes.map((quote, i) => {
                  const isUp = (quote.change24h ?? 0) >= 0;
                  return (
                    <span key={`${loop}-${quote.symbol}`} className="inline-flex items-center">
                      <a
                        href={quote.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
                      >
                        {quote.symbol} {formatUsd(quote.price)}{" "}
                        <span
                          className={
                            isUp
                              ? "text-[var(--ink-faint)]"
                              : "text-[var(--accent-red)]"
                          }
                        >
                          {formatChange(quote.change24h)}
                        </span>
                      </a>
                      {i < quotes.length - 1 && (
                        <span className="mx-3 text-[var(--rule-light)]">|</span>
                      )}
                    </span>
                  );
                })}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
