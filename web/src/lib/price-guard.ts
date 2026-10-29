/**
 * Price guard for AI-written copy.
 *
 * Writers asked for "a specific market figure" will quote crypto prices from
 * training data when none are in the prompt. The 2026-10-29 daily edition
 * (the Afghan opium lead) said Bitcoin was "hovering around $31,800" and
 * Ethereum "near $1,950", which are mid-2023 prices.
 *
 * stripStalePrices drops any sentence that gives a dollar price for a
 * tracked asset unless the figure is within PRICE_TOLERANCE of the live
 * price. With no live price for that asset, the sentence is dropped too.
 * Deterministic and free: regexes only.
 */

export const PRICE_TOLERANCE = 0.1;

/** Keys match CoinGecko ids, so `MarketData.prices` can be passed straight in. */
const ASSETS: Array<{ key: string; pattern: RegExp }> = [
  { key: "bitcoin", pattern: /\b(?:bitcoin|btc)\b/i },
  { key: "ethereum", pattern: /\b(?:ethereum|ether|eth)\b/i },
  // Case-sensitive: "sol" is too common a fragment to match loosely.
  { key: "solana", pattern: /\b(?:Solana|SOL)\b/ },
];

/** "$31,800", "$31.8k", "$ 1950". Figures followed by million/billion are flows, not prices. */
const DOLLAR = /\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mn|million|b|bn|billion|tn|trillion)?\b/gi;

function figuresIn(sentence: string): number[] {
  const out: number[] = [];
  for (const m of sentence.matchAll(DOLLAR)) {
    const unit = (m[2] ?? "").toLowerCase();
    if (unit && unit !== "k" && unit !== "thousand") continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    out.push(unit ? n * 1000 : n);
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=["“‘'(]?[A-Z0-9])/);
}

export interface PriceGuardResult {
  text: string;
  removed: string[];
}

export function stripStalePrices(text: string, livePrices: Record<string, number>): PriceGuardResult {
  const removed: string[] = [];
  const kept = splitSentences(text).filter((sentence) => {
    const assets = ASSETS.filter((a) => a.pattern.test(sentence));
    if (assets.length === 0) return true;
    const figures = figuresIn(sentence);
    if (figures.length === 0) return true;
    const ok = figures.every((f) =>
      assets.some((a) => {
        const live = livePrices[a.key];
        return typeof live === "number" && live > 0 && Math.abs(f - live) / live <= PRICE_TOLERANCE;
      }),
    );
    if (!ok) removed.push(sentence);
    return ok;
  });
  return { text: kept.join(" "), removed };
}
