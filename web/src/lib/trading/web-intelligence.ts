/**
 * web-intelligence.ts — Autonomous web research signal for the composite scorer.
 *
 * Periodically searches the web for crypto market sentiment, analyst calls,
 * key support/resistance levels, and dominant narratives. Uses an LLM to
 * extract structured signals from raw search results.
 *
 * Signal logic:
 *   - LLM-extracted sentiment → direction (long/short/neutral)
 *   - Key levels near current price → boosted strength
 *   - Dominant narratives → context for reasoning
 *   - Market regime (trending/mean-reverting) → context for strategy
 *
 * 20-minute cache per symbol. Graceful fallback to null if search/LLM fails.
 */

import "server-only";

import type { TraderExecutionConfig } from "./types";
import { generateTextForTask } from "../ai-provider";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface WebIntelligenceSignal {
  source: "web-intelligence";
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  /** 0-1 — boosted when current price is near a key level */
  strength: number;
  /** 0-1 — how unanimous the web sentiment is */
  confidence: number;
  /** Key resistance levels (for longs: TP zones) */
  resistanceLevels: number[];
  /** Key support levels (for shorts: TP zones; for longs: stop zones) */
  supportLevels: number[];
  /** Dominant market narratives driving sentiment */
  narratives: string[];
  /** Whether market favors trend-following or mean-reversion */
  regime: "trending" | "mean-reverting" | "uncertain";
  reasons: string[];
}

/* ═══════════════════════════  Cache  ═══════════════════════════ */

interface CachedValue<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CachedValue<unknown>>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/* ═══════════════════════════  Config  ═══════════════════════════ */

const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY ?? "";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

/** Map trading symbols to search-friendly names */
const SYMBOL_NAMES: Record<string, string> = {
  BTC: "Bitcoin BTC",
  ETH: "Ethereum ETH",
  SOL: "Solana SOL",
  HYPE: "Hyperliquid HYPE",
  XRP: "Ripple XRP",
  SUI: "SUI",
  DOGE: "Dogecoin DOGE",
  LINK: "Chainlink LINK",
  AVAX: "Avalanche AVAX",
  BNB: "BNB",
  PAXG: "PAXG gold",
  TAO: "Bittensor TAO",
  ZEC: "Zcash ZEC",
  FET: "Fetch.ai FET",
  TRUMP: "TRUMP memecoin",
  BCH: "Bitcoin Cash BCH",
  WLD: "Worldcoin WLD",
  AAVE: "Aave AAVE",
  OP: "Optimism OP",
  ARB: "Arbitrum ARB",
};

/* ═══════════════════════════  Brave Search  ═══════════════════════════ */

interface BraveSearchResult {
  title: string;
  description: string;
  url: string;
}

async function braveSearch(query: string, count = 10): Promise<BraveSearchResult[]> {
  if (!BRAVE_SEARCH_API_KEY) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(count),
      freshness: "pd", // past day
    });

    const res = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[web-intel] Brave search ${res.status}: ${await res.text().catch(() => "")}`);
      return [];
    }

    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
    };

    return (data.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      description: r.description ?? "",
      url: r.url ?? "",
    }));
  } catch (err) {
    console.warn(`[web-intel] Brave search failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/* ═══════════════════════════  LLM Extraction  ═══════════════════════════ */

interface LLMExtractedIntel {
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-100
  supportLevels: number[];
  resistanceLevels: number[];
  narratives: string[];
  regime: "trending" | "mean-reverting" | "uncertain";
  reasoning: string;
}

async function extractIntelligence(
  symbol: string,
  searchResults: BraveSearchResult[],
  currentPriceUsd?: number,
): Promise<LLMExtractedIntel | null> {
  if (searchResults.length === 0) return null;

  // Build context from search results
  const snippets = searchResults
    .slice(0, 8) // limit to 8 results to keep context manageable
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}`)
    .join("\n\n");

  const priceContext = currentPriceUsd ? `Current ${symbol} price: $${currentPriceUsd.toFixed(2)}` : "";

  const systemPrompt = `You are a crypto market intelligence analyst. Analyze web search results and extract structured trading signals. Return ONLY valid JSON, no markdown, no explanation outside the JSON.`;

  const userPrompt = `Analyze these web search results about ${SYMBOL_NAMES[symbol] ?? symbol} and extract a structured signal.

${priceContext}

Search results:
${snippets}

Return this exact JSON structure:
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": <0-100, how unanimous the sentiment is across sources>,
  "supportLevels": [<up to 5 key support price levels, descending>],
  "resistanceLevels": [<up to 5 key resistance price levels, ascending>],
  "narratives": ["<top 3 narratives driving price action>"],
  "regime": "trending" | "mean-reverting" | "uncertain",
  "reasoning": "<one sentence summary>"
}

Rules:
- Only include price levels that appear in the search results or are widely cited
- Only include levels within 20% of current price${currentPriceUsd ? ` ($${currentPriceUsd.toFixed(0)})` : ""}
- Confidence should reflect how many sources agree, not just one headline
- If sources are mixed/contradictory, set sentiment to neutral with low confidence
- Return ONLY the JSON object, nothing else`;

  try {
    const result = await generateTextForTask({
      task: "webIntelligence",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 512,
      temperature: 0.2,
      timeoutMs: 15_000,
    });

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonText = result.text.trim();
    // Strip markdown code fences if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonText) as LLMExtractedIntel;

    // Validate
    if (
      !parsed.sentiment ||
      typeof parsed.confidence !== "number" ||
      !Array.isArray(parsed.supportLevels) ||
      !Array.isArray(parsed.resistanceLevels)
    ) {
      console.warn("[web-intel] Invalid LLM response structure");
      return null;
    }

    return {
      sentiment: parsed.sentiment,
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
      supportLevels: parsed.supportLevels.filter((n) => typeof n === "number" && n > 0),
      resistanceLevels: parsed.resistanceLevels.filter((n) => typeof n === "number" && n > 0),
      narratives: Array.isArray(parsed.narratives) ? parsed.narratives.slice(0, 5) : [],
      regime: parsed.regime ?? "uncertain",
      reasoning: parsed.reasoning ?? "",
    };
  } catch (err) {
    console.warn("[web-intel] LLM extraction failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/* ═══════════════════════════  Main Export  ═══════════════════════════ */

/**
 * Fetch web intelligence signal for a trading symbol.
 * Searches the web, extracts structured data via LLM, returns a signal.
 * Results are cached for 20 minutes per symbol.
 *
 * Returns null if search/LLM fails — composite scorer redistributes weight.
 */
export async function fetchWebIntelligenceSignal(
  _config: TraderExecutionConfig,
  symbol: string,
  currentPriceUsd?: number,
): Promise<WebIntelligenceSignal | null> {
  const cacheKey = `web-intel:${symbol}`;
  const cached = getCached<WebIntelligenceSignal>(cacheKey);
  if (cached) return cached;

  if (!BRAVE_SEARCH_API_KEY) {
    // No search API configured — skip silently
    return null;
  }

  const searchName = SYMBOL_NAMES[symbol] ?? symbol;

  // Run two searches in parallel for broader coverage
  const [priceResults, sentimentResults] = await Promise.all([
    braveSearch(`${searchName} price prediction support resistance levels ${new Date().toISOString().slice(0, 10)}`, 8),
    braveSearch(`${searchName} crypto sentiment analysis reddit`, 5),
  ]);

  const allResults = [...priceResults, ...sentimentResults];

  if (allResults.length === 0) {
    console.warn(`[web-intel] No search results for ${symbol}`);
    return null;
  }

  const intel = await extractIntelligence(symbol, allResults, currentPriceUsd);
  if (!intel) return null;

  // Convert to signal
  const direction: "long" | "short" | "neutral" =
    intel.sentiment === "bullish" ? "long" :
    intel.sentiment === "bearish" ? "short" : "neutral";

  let strength = intel.confidence / 100;

  // Boost strength if current price is near a key level (within 3%)
  if (currentPriceUsd && currentPriceUsd > 0) {
    const allLevels = [...intel.supportLevels, ...intel.resistanceLevels];
    const nearLevel = allLevels.some(
      (level) => Math.abs(currentPriceUsd - level) / currentPriceUsd < 0.03,
    );
    if (nearLevel) {
      strength = Math.min(1, strength * 1.3); // 30% boost near key levels
    }
  }

  const signal: WebIntelligenceSignal = {
    source: "web-intelligence",
    symbol,
    timestamp: Date.now(),
    direction,
    strength,
    confidence: intel.confidence / 100,
    resistanceLevels: intel.resistanceLevels,
    supportLevels: intel.supportLevels,
    narratives: intel.narratives,
    regime: intel.regime,
    reasons: [
      `Web Intel: ${intel.sentiment} (conf ${intel.confidence}%)`,
      `Regime: ${intel.regime}`,
      ...(intel.narratives.length > 0 ? [`Narratives: ${intel.narratives.join(", ")}`] : []),
      ...(intel.reasoning ? [intel.reasoning] : []),
    ],
  };

  setCache(cacheKey, signal, CACHE_TTL_MS);
  console.log(
    `[web-intel] ${symbol}: ${direction} conf=${(intel.confidence / 100).toFixed(2)} regime=${intel.regime} ` +
    `support=[${intel.supportLevels.map((l) => l.toFixed(0)).join(",")}] ` +
    `resistance=[${intel.resistanceLevels.map((l) => l.toFixed(0)).join(",")}]`,
  );

  return signal;
}
