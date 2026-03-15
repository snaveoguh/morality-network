import "server-only";

import type { MarketImpactDirection, MarketImpactTimeHorizon } from "../article";
import { listRecentMarketImpactRecords } from "../editorial-archive";
import { computeEventShapedSentimentSnapshotFromFeeds } from "../event-corpus";
import { DEFAULT_FEEDS, fetchAllFeeds, type FeedItem } from "../rss";
import { TOPIC_TAXONOMY, matchesTopicDefinition } from "../sentiment";

// ============================================================================
// AGGREGATED MARKET SIGNALS
// Consumes archived editorial market impact → per-ticker directional scores
// ============================================================================

export interface AggregatedMarketSignal {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  observations: number;
  latestGeneratedAt: string;
  supportingClaims: string[];
  /** 0 = unanimous, 1 = perfectly split bullish/bearish */
  contradictionPenalty: number;
  /** Sum of weighted bullish deltas */
  bullishWeight: number;
  /** Sum of weighted bearish deltas (always ≥ 0) */
  bearishWeight: number;
  /** Pre-penalty directional score for debugging */
  rawScore: number;
}

interface SignalAccumulator {
  bullishWeight: number;
  bearishWeight: number;
  observations: number;
  latestTs: number;
  claims: string[];
}

// ── Asset → HL ticker mapping ─────────────────────────────────────────────

const TICKER_ALIASES: Record<string, string> = {
  BTC: "BTC",
  XBT: "BTC",
  ETH: "ETH",
  ZEC: "ZEC",
  SOL: "SOL",
  DOGE: "DOGE",
  AVAX: "AVAX",
  LINK: "LINK",
  ARB: "ARB",
  OP: "OP",
  XAU: "GOLD",
  GC: "GOLD",
  GOLD: "GOLD",
  XAG: "SILVER",
  SI: "SILVER",
  SILVER: "SILVER",
  CL: "OIL",
  BRN: "OIL",
  WTI: "OIL",
  OIL: "OIL",
  DXY: "DXY",
  UST: "DXY",
  US10Y: "DXY",
  SPX: "SPX",
  SPY: "SPX",
  ES: "SPX",
  NDX: "SPX",
  QQQ: "SPX",
};

const EXACT_ASSET_ALIASES: Record<string, string> = {
  "bitcoin": "BTC",
  "ethereum": "ETH",
  "zcash": "ZEC",
  "solana": "SOL",
  "gold": "GOLD",
  "silver": "SILVER",
  "crude oil": "OIL",
  "us dollar index": "DXY",
  "digital assets": "BTC",
  "ai & semiconductor equities": "SPX",
  "healthcare & biotech": "SPX",
  "global trade flows": "DXY",
  "global macro": "DXY",
  "defense & commodities": "OIL",
  "energy transition": "OIL",
  "political risk": "DXY",
  "governance risk": "SPX",
  "esg & social impact": "SPX",
  "haleon plc": "SPX",
  "uk consumer staples etf": "SPX",
  "indian pharmaceutical index": "SPX",
};

const SYMBOL_PATTERNS: Array<{ symbol: string; pattern: RegExp }> = [
  { symbol: "BTC", pattern: /\b(bitcoin|btc|xbt|digital assets?)\b/i },
  { symbol: "ETH", pattern: /\b(ethereum|eth|l2|layer\s*2|rollup)\b/i },
  { symbol: "ZEC", pattern: /\b(zcash|zec)\b/i },
  { symbol: "SOL", pattern: /\b(solana|sol)\b/i },
  { symbol: "DOGE", pattern: /\b(doge|dogecoin)\b/i },
  { symbol: "AVAX", pattern: /\b(avalanche|avax)\b/i },
  { symbol: "LINK", pattern: /\b(chainlink|link)\b/i },
  { symbol: "ARB", pattern: /\b(arbitrum|arb)\b/i },
  { symbol: "OP", pattern: /\b(optimism)\b/i },
  { symbol: "GOLD", pattern: /\b(gold|xau|bullion|precious metal)\b/i },
  { symbol: "SILVER", pattern: /\b(silver|xag)\b/i },
  { symbol: "OIL", pattern: /\b(oil|crude|wti|brent|petroleum|barrel|opec|energy)\b/i },
  {
    symbol: "DXY",
    pattern:
      /\b(dxy|dollar|usd|us treasury|treasury yields?|rates?|inflation|fomc|macro|trade flows?|political risk)\b/i,
  },
  {
    symbol: "SPX",
    pattern:
      /\b(spx|s&p\s*500|nasdaq(?:-100)?|qqq|equit(?:y|ies)|stocks?|etf|consumer staples?|pharma(?:ceutical)?|biotech|healthcare|semiconductor|haleon|corporate)\b/i,
  },
];

const HORIZON_WEIGHTS: Record<MarketImpactTimeHorizon, number> = {
  minutes: 0.7,
  hours: 0.85,
  days: 1,
  weeks: 1.15,
  months: 1.3,
};

/** Max age for records to consider (72h — beyond this, recency weight is negligible). */
const MAX_RECORD_AGE_MS = 72 * 60 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9&/+.\-\s]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeTicker(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value
    .trim()
    .toUpperCase()
    .split(/[\/:\s]/)[0]
    .replace(/-PERP$/i, "")
    .replace(/PERP$/i, "")
    .replace(/-USD$/i, "")
    .replace(/-USDT$/i, "")
    .replace(/USD$/i, "")
    .replace(/USDT$/i, "")
    .replace(/[^A-Z0-9]/g, "");
  return upper || null;
}

function extractTickerFromAsset(asset: string): string | null {
  const direct = asset.match(/\(([A-Za-z0-9/:\-.]{1,12})\)/);
  if (direct?.[1]) {
    return normalizeTicker(direct[1]);
  }
  const suffixed = asset.match(/\b(?:ticker|symbol)\s*[:=]\s*([A-Za-z0-9/:\-.]{1,12})\b/i);
  if (suffixed?.[1]) {
    return normalizeTicker(suffixed[1]);
  }
  return null;
}

function mapAssetToSymbol(asset: string, ticker: string | null): string | null {
  const tickerAlias = TICKER_ALIASES[normalizeTicker(ticker) || ""];
  if (tickerAlias) return tickerAlias;

  const embeddedTickerAlias = TICKER_ALIASES[extractTickerFromAsset(asset) || ""];
  if (embeddedTickerAlias) return embeddedTickerAlias;

  const normalized = normalizeText(asset);
  if (!normalized) return null;

  if (EXACT_ASSET_ALIASES[normalized]) {
    return EXACT_ASSET_ALIASES[normalized];
  }

  for (const candidate of SYMBOL_PATTERNS) {
    if (candidate.pattern.test(normalized)) {
      return candidate.symbol;
    }
  }

  return null;
}

function directionToSigned(direction: MarketImpactDirection): 1 | -1 | 0 {
  if (direction === "bullish") return 1;
  if (direction === "bearish") return -1;
  return 0;
}

function computeRecencyWeight(generatedAt: string): number {
  const ts = new Date(generatedAt).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0.2;
  const ageHours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
  return Math.max(0.2, Math.exp(-ageHours / 48));
}

function computeHorizonWeight(horizons: MarketImpactTimeHorizon[]): number {
  if (!horizons.length) return 1;
  const sum = horizons.reduce((acc, h) => acc + (HORIZON_WEIGHTS[h] ?? 1), 0);
  return sum / horizons.length;
}

function safeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

const FALLBACK_TOPIC_TO_SYMBOL: Record<string, string> = {
  btc: "BTC",
  eth: "ETH",
  gold: "GOLD",
  oil: "OIL",
  usd: "DXY",
};

/** Race a promise against a timeout — returns fallback on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Only fetch market-relevant feeds for the signals fallback (fast subset ~12 feeds, not 70+). */
const SIGNAL_FEED_CATEGORIES = new Set(["Business", "Crypto"]);

async function getFallbackFeedSignals(): Promise<AggregatedMarketSignal[]> {
  try {
    // Only fetch market-relevant feeds — skip world news / science / reddit / 4chan
    const marketFeeds = DEFAULT_FEEDS.filter(
      (feed) => SIGNAL_FEED_CATEGORIES.has(feed.category),
    );
    // If no market feeds matched (categories changed), fall back to full list but with tight timeout
    const feedsToFetch = marketFeeds.length > 0 ? marketFeeds : DEFAULT_FEEDS;

    // Race the entire fallback against a 20s timeout (Vercel serverless limit is typically 30s)
    const items = await withTimeout(
      fetchAllFeeds(feedsToFetch),
      20_000,
      [] as FeedItem[],
    );
    if (items.length === 0) return [];

    const snapshot = await withTimeout(
      computeEventShapedSentimentSnapshotFromFeeds(items, null),
      15_000,
      null,
    );
    if (!snapshot) return [];

    const signals = snapshot.topics
      .filter((topic) => topic.category === "asset")
      .map((topic) => {
        const symbol = FALLBACK_TOPIC_TO_SYMBOL[topic.slug] || topic.slug.toUpperCase();
        const signedScore = safeFinite((topic.score - 50) / 10, 0);
        const definition = TOPIC_TAXONOMY.find((candidate) => candidate.slug === topic.slug);
        const supportingClaims = definition
          ? items
              .filter((item) => matchesTopicDefinition(item, definition))
              .map((item) => item.canonicalClaim || item.title)
              .filter(Boolean)
              .slice(0, 3)
          : [];

        return {
          symbol,
          direction: signedScore >= 0 ? "bullish" : "bearish",
          score: Math.abs(signedScore),
          observations: topic.articleCount,
          latestGeneratedAt: snapshot.generatedAt,
          supportingClaims,
          contradictionPenalty: Math.max(
            0,
            Math.min(1, safeFinite(topic.signals.contradictionRatio, 0)),
          ),
          bullishWeight: Math.max(signedScore, 0),
          bearishWeight: Math.max(-signedScore, 0),
          rawScore: signedScore,
        } satisfies AggregatedMarketSignal;
      })
      .filter((signal) => signal.observations > 0 && signal.score > 0);

    signals.sort((a, b) => b.score - a.score);
    return signals;
  } catch (error) {
    console.warn("[signals] live feed fallback failed:", error);
    return [];
  }
}

// ── Main Aggregator ────────────────────────────────────────────────────────

export async function getAggregatedMarketSignals(options?: {
  limit?: number;
  minAbsScore?: number;
}): Promise<AggregatedMarketSignal[]> {
  const limit = options?.limit ?? 250;
  const minAbsScore = options?.minAbsScore ?? 0.2;

  // Race the indexer call against a 10s timeout — if the backend is down, fail fast to fallback
  const records = await withTimeout(
    listRecentMarketImpactRecords(limit),
    10_000,
    [],
  );
  if (records.length === 0) {
    return getFallbackFeedSignals();
  }

  const now = Date.now();
  const bySymbol = new Map<string, SignalAccumulator>();
  let totalProcessed = 0;
  let totalMapped = 0;
  let totalUnmapped = 0;

  for (const record of records) {
    // Skip stale records — 72h+ records have negligible recency weight
    const recordTs = new Date(record.generatedAt).getTime();
    if (Number.isFinite(recordTs) && now - recordTs > MAX_RECORD_AGE_MS) {
      continue;
    }

    const recencyWeight = computeRecencyWeight(record.generatedAt);
    const significance = safeFinite(record.marketImpact.significance, 0);
    const significanceWeight = Math.max(0, Math.min(100, significance)) / 100;

    for (const market of record.marketImpact.affectedMarkets) {
      totalProcessed += 1;
      const symbol = mapAssetToSymbol(market.asset, market.ticker);
      if (!symbol) {
        totalUnmapped += 1;
        continue;
      }
      totalMapped += 1;

      const directionSigned = directionToSigned(market.direction);
      if (directionSigned === 0) continue;

      const confidence = Math.max(0, Math.min(1, safeFinite(market.confidence, 0)));
      if (confidence <= 0) continue;

      const horizonWeight = computeHorizonWeight(market.timeHorizons);
      const absDelta = safeFinite(
        confidence * significanceWeight * recencyWeight * horizonWeight,
        0,
      );
      if (absDelta <= 0) continue;

      const current = bySymbol.get(symbol) ?? {
        bullishWeight: 0,
        bearishWeight: 0,
        observations: 0,
        latestTs: 0,
        claims: [],
      };

      if (directionSigned > 0) {
        current.bullishWeight += absDelta;
      } else {
        current.bearishWeight += absDelta;
      }

      current.observations += 1;
      current.latestTs = Math.max(current.latestTs, recordTs || 0);
      if (current.claims.length < 3 && !current.claims.includes(record.claim)) {
        current.claims.push(record.claim);
      }
      bySymbol.set(symbol, current);
    }
  }

  console.log(
    `[signals] aggregated ${records.length} records, ${totalProcessed} markets (${totalMapped} mapped, ${totalUnmapped} unmapped), ${bySymbol.size} tickers`,
  );

  const signals = Array.from(bySymbol.entries())
    .map(([symbol, acc]) => {
      const totalWeight = acc.bullishWeight + acc.bearishWeight;
      if (totalWeight <= 0) return null;

      // Contradiction: 0 = all same direction, 1 = perfectly split
      const maxWeight = Math.max(acc.bullishWeight, acc.bearishWeight);
      const minWeight = Math.min(acc.bullishWeight, acc.bearishWeight);
      const contradictionPenalty = maxWeight > 0 ? minWeight / maxWeight : 0;

      // Raw directional score
      const rawScore = acc.bullishWeight - acc.bearishWeight;

      // Dampen by contradiction — 50% dampening at perfect contradiction
      const dampedScore = rawScore * (1 - contradictionPenalty * 0.5);

      const direction: AggregatedMarketSignal["direction"] =
        dampedScore >= 0 ? "bullish" : "bearish";
      const score = Math.abs(dampedScore);

      return {
        symbol,
        direction,
        score: safeFinite(score, 0),
        observations: acc.observations,
        latestGeneratedAt:
          acc.latestTs > 0 ? new Date(acc.latestTs).toISOString() : new Date(0).toISOString(),
        supportingClaims: acc.claims,
        contradictionPenalty: safeFinite(contradictionPenalty, 0),
        bullishWeight: safeFinite(acc.bullishWeight, 0),
        bearishWeight: safeFinite(acc.bearishWeight, 0),
        rawScore: safeFinite(rawScore, 0),
      };
    })
    .filter((s): s is AggregatedMarketSignal => s !== null && s.score >= minAbsScore)
    .sort((a, b) => b.score - a.score);

  return signals;
}
