import type { FeedItem } from "./rss";
import { KEYWORD_PATTERNS } from "./rss";
import {
  getSourceBias,
  biasToPosition,
  type FactualityRating,
  type SourceBias,
} from "./bias";
import {
  detectContradictions,
  type AgentClaimVariant,
} from "./agent-swarm";
import { loadTtlValue, type TtlCacheEntry } from "./ttl-cache";

// ============================================================================
// MORALITY INDEX — Multi-signal sentiment scoring per topic
//
// Six signals per topic:
//   1. Editorial Sentiment (30%) — Claude AI semantic scoring (keyword fallback)
//   2. Human Impact Severity(15/20%) — Claude AI severity scoring (inverted)
//   3. Coverage Velocity   (15/18%) — article count ratio (24h vs 72h baseline)
//   4. Contradiction Density(10%) — inverse of inter-source contradictions
//   5. Market Movement      (20%) — 24h price change (assets only)
//   6. Bias Polarity Spread (10/12%) — std dev of covering sources' bias positions
//
// Score range: 0 (extreme fear) → 50 (neutral) → 100 (extreme optimism)
// ============================================================================

// ── Topic Taxonomy ──────────────────────────────────────────────────────────

const MARKET_DATA_CACHE_TTL_MS = 60_000;
const marketDataCache = new Map<string, TtlCacheEntry<MarketData>>();

export interface TopicDefinition {
  slug: string;
  displayName: string;
  category: "asset" | "thematic";
  /** Regex to match article title+description */
  pattern: RegExp;
  /** CoinGecko ID for market data, null for thematic topics */
  marketId: string | null;
  /** Symbol for display (e.g. "₿", "$", "⛽") */
  symbol: string;
}

export const TOPIC_TAXONOMY: TopicDefinition[] = [
  // ── Assets (with market data) ──
  { slug: "btc", displayName: "Bitcoin", category: "asset", pattern: /\b(bitcoin|btc)\b/i, marketId: "bitcoin", symbol: "₿" },
  { slug: "eth", displayName: "Ethereum", category: "asset", pattern: /\b(ethereum|eth(?:er)?|layer.?2|rollup|l2)\b/i, marketId: "ethereum", symbol: "Ξ" },
  { slug: "gold", displayName: "Gold", category: "asset", pattern: /\b(gold|bullion|precious\s*metal|gold\s*price|gold\s*reserve)\b/i, marketId: null, symbol: "Au" },
  { slug: "oil", displayName: "Oil & Energy", category: "asset", pattern: /\b(crude|oil\s*price|opec|brent|petroleum|barrel|wti)\b/i, marketId: null, symbol: "⛽" },
  { slug: "usd", displayName: "US Dollar", category: "asset", pattern: /\b(dollar|fed(eral\s*reserve)?|interest\s*rate|treasury|fomc|rate\s*cut|rate\s*hike|cpi|inflation)\b/i, marketId: null, symbol: "$" },

  // ── Thematic (no market data) ──
  { slug: "ai", displayName: "Artificial Intelligence", category: "thematic", pattern: KEYWORD_PATTERNS.ai || /\b(ai|artificial\s*intelligence|machine\s*learning|llm|openai|deepmind|chatgpt)\b/i, marketId: null, symbol: "🧠" },
  { slug: "climate", displayName: "Climate & Environment", category: "thematic", pattern: /\b(climate|warming|carbon|emission|environmental|renewable|fossil\s*fuel|drought|wildfire|glacier)\b/i, marketId: null, symbol: "🌍" },
  { slug: "trade", displayName: "Trade & Tariffs", category: "thematic", pattern: KEYWORD_PATTERNS.trade || /\b(tariff|trade\s*war|sanction|export|import|trade\s*deal|embargo|protectionism)\b/i, marketId: null, symbol: "📦" },
  { slug: "war", displayName: "Conflict & Security", category: "thematic", pattern: KEYWORD_PATTERNS.war || /\b(war|invasion|airstrike|missile|troops|military|ceasefire|bombing)\b/i, marketId: null, symbol: "⚔" },
  { slug: "election", displayName: "Elections & Democracy", category: "thematic", pattern: KEYWORD_PATTERNS.election || /\b(election|ballot|poll|voter|campaign|candidate|primary|referendum)\b/i, marketId: null, symbol: "🗳" },
  { slug: "crypto", displayName: "Crypto & Web3", category: "thematic", pattern: KEYWORD_PATTERNS.crypto || /\b(crypto|blockchain|defi|nft|web3|token|stablecoin|dao)\b/i, marketId: null, symbol: "⛓" },
  { slug: "economy", displayName: "Global Economy", category: "thematic", pattern: KEYWORD_PATTERNS.economy || /\b(economy|gdp|recession|growth|unemployment|market|inflation)\b/i, marketId: null, symbol: "📈" },
  { slug: "rights", displayName: "Human Rights", category: "thematic", pattern: KEYWORD_PATTERNS.rights || /\b(rights|freedom|protest|justice|equality|discrimination|civil\s*liberty)\b/i, marketId: null, symbol: "⚖" },
  { slug: "health", displayName: "Health & Pandemic", category: "thematic", pattern: KEYWORD_PATTERNS.health || /\b(health|vaccine|pandemic|disease|medical|hospital|outbreak|who)\b/i, marketId: null, symbol: "🏥" },
  { slug: "scandal", displayName: "Scandal & Corruption", category: "thematic", pattern: KEYWORD_PATTERNS.scandal || /\b(scandal|corruption|fraud|indictment|bribery|embezzlement|coverup)\b/i, marketId: null, symbol: "🔍" },
];

// ── Sentiment Lexicon ───────────────────────────────────────────────────────

const POSITIVE_TERMS = new Set([
  "rally", "surge", "soar", "gain", "gains", "rise", "rises", "rising", "boost",
  "breakthrough", "milestone", "approve", "approved", "approval", "pass", "passes",
  "bullish", "growth", "expand", "expansion", "recovery", "recover", "recovered",
  "peace", "ceasefire", "agreement", "deal", "alliance", "partnership", "cooperat",
  "profit", "profits", "earnings", "revenue", "record", "high", "highs", "peak",
  "success", "succeed", "win", "wins", "victory", "triumph", "achieve",
  "innovate", "innovation", "advance", "advancement", "progress", "improve",
  "optimism", "optimistic", "confident", "confidence", "strong", "strength",
  "support", "supported", "backing", "endorse", "endorsed", "embrace",
  "resolve", "resolved", "solution", "solve", "solved",
  "invest", "investment", "funding", "funded", "raise", "raised", "capital",
  "upgrade", "outperform", "exceed", "exceeded", "beat", "beats",
  "stabilize", "stable", "stability", "secure", "secured", "safety",
  "freedom", "liberate", "liberation", "reform", "reformed",
]);

const NEGATIVE_TERMS = new Set([
  "crash", "collapse", "plunge", "plummet", "drop", "drops", "decline", "fall",
  "crisis", "recession", "downturn", "slump", "depression", "stagnation",
  "sanction", "sanctions", "embargo", "tariff", "restriction", "ban", "banned",
  "war", "invasion", "attack", "attacks", "bomb", "bombing", "strike", "strikes",
  "kill", "killed", "death", "deaths", "casualties", "wounded", "massacre",
  "bearish", "loss", "losses", "deficit", "debt", "default", "bankrupt",
  "fail", "failed", "failure", "reject", "rejected", "veto", "blocked",
  "scandal", "corruption", "fraud", "indictment", "charged", "convicted",
  "threat", "threats", "threaten", "risk", "risks", "danger", "dangerous",
  "fear", "panic", "anxiety", "concern", "worried", "alarming", "alarm",
  "protest", "protests", "riot", "riots", "unrest", "chaos", "turmoil",
  "inflation", "overvalued", "bubble", "layoff", "layoffs", "fired", "cut",
  "hack", "hacked", "breach", "exploit", "vulnerability", "scam",
  "shutdown", "closure", "suspend", "suspended", "halt", "halted",
  "violate", "violation", "abuse", "crackdown", "censor", "censorship",
  "pollution", "contamination", "disaster", "catastrophe", "devastat",
]);

// ── Types ───────────────────────────────────────────────────────────────────

export interface AITopicScore {
  sentiment: number; // 0-100
  severity: number;  // 0-100
}

export interface TopicSignals {
  sentimentScore: number;    // 0-100 (Claude AI or keyword fallback)
  severityScore: number;     // 0-100 human impact severity (higher = more severe)
  volumeScore: number;       // 0-100
  contradictionScore: number;// 0-100
  contradictionRatio: number;// raw ratio for dampening
  marketScore: number | null;// 0-100 or null
  biasSpreadScore: number;   // 0-100
}

export interface TopicSentimentResult {
  slug: string;
  displayName: string;
  symbol: string;
  category: "asset" | "thematic";
  score: number;           // 0-100 composite
  previousScore: number | null;
  trend: number;           // delta from previous
  signals: TopicSignals;
  articleCount: number;
  eventCount?: number;
  sourceCount: number;
  topSources: string[];
  lastUpdated: string;     // ISO
}

export interface SentimentSnapshot {
  generatedAt: string;
  topics: TopicSentimentResult[];
  globalScore: number;
  globalTrend: number;
  feedItemsScanned: number;
  corpusMode?: "feed" | "event";
  eventCount?: number;
  rawArticleCount?: number;
  sourceRegistrySize?: number;
  queuedCrawlTargets?: number;
}

export interface MarketData {
  /** Map of CoinGecko ID → 24h price change % */
  priceChanges: Record<string, number>;
}

// ── Factuality Weights ──────────────────────────────────────────────────────

const FACTUALITY_WEIGHTS: Record<FactualityRating, number> = {
  "very-high": 1.0,
  "high": 0.85,
  "mostly-factual": 0.65,
  "mixed": 0.4,
  "low": 0.2,
  "very-low": 0.1,
};

function factualityWeight(rating: FactualityRating | undefined): number {
  if (!rating) return 0.5; // unknown source gets middle weight
  return FACTUALITY_WEIGHTS[rating] ?? 0.5;
}

function itemSourceNames(item: FeedItem): string[] {
  const names = item.sourceNames?.filter(Boolean) ?? [];
  if (names.length > 0) return Array.from(new Set(names));
  return item.source ? [item.source] : [];
}

function itemFactualityWeight(item: FeedItem): number {
  const names = itemSourceNames(item);
  if (names.length === 0) {
    return factualityWeight(item.bias?.factuality);
  }

  const weights = names
    .map((name) => getSourceBias(name)?.factuality)
    .map((rating) => factualityWeight(rating))
    .filter((value) => Number.isFinite(value));

  if (weights.length === 0) {
    return factualityWeight(item.bias?.factuality);
  }

  return weights.reduce((sum, value) => sum + value, 0) / weights.length;
}

// ── Signal Computation ──────────────────────────────────────────────────────

/**
 * Score a single text for sentiment (-1 to +1).
 */
function scoreSentiment(text: string): number {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/).filter(Boolean);

  let pos = 0;
  let neg = 0;
  for (const word of words) {
    if (POSITIVE_TERMS.has(word)) pos++;
    if (NEGATIVE_TERMS.has(word)) neg++;
  }

  if (pos + neg === 0) return 0;
  return (pos - neg) / (pos + neg);
}

/**
 * Signal A: Editorial Sentiment (source-weighted).
 * Returns 0-100 where 50 = neutral.
 */
function computeSentimentSignal(items: FeedItem[]): number {
  if (items.length === 0) return 50;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    const text = `${item.title} ${item.description || ""}`;
    const rawSentiment = scoreSentiment(text); // -1 to +1
    const weight = itemFactualityWeight(item);

    weightedSum += rawSentiment * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 50;
  const avg = weightedSum / totalWeight; // -1 to +1
  return Math.round(50 + avg * 50); // 0-100
}

/**
 * Signal B: Coverage Velocity.
 * Ratio of 24h articles to 72h daily average.
 */
function computeVolumeSignal(items: FeedItem[]): number {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const h72 = 72 * 60 * 60 * 1000;

  let count24 = 0;
  let count72 = 0;

  for (const item of items) {
    const age = now - new Date(item.pubDate).getTime();
    if (age <= h24) count24++;
    if (age <= h72) count72++;
  }

  const dailyAvg72 = Math.max(count72 / 3, 1);
  const ratio = count24 / dailyAvg72;

  // Map ratio to 0-100
  if (ratio < 0.3) return 15;
  if (ratio < 0.5) return 30;
  if (ratio < 0.8) return 45;
  if (ratio < 1.2) return 55;
  if (ratio < 1.8) return 70;
  if (ratio < 2.5) return 82;
  return 95;
}

/**
 * Signal C: Contradiction Density.
 * High contradictions → score toward 50 (uncertainty).
 */
function computeContradictionSignal(items: FeedItem[]): { score: number; ratio: number } {
  if (items.length < 2) return { score: 70, ratio: 0 };

  // Build claim variants from articles
  const variants: AgentClaimVariant[] = items.slice(0, 50).map((item) => ({
    source: item.source,
    link: item.link,
    claim: item.canonicalClaim || item.title,
    confidence: 0.5,
  }));

  const contradictions = detectContradictions(variants);
  const ratio = contradictions.length / Math.max(items.length, 1);

  // Low contradictions = high score (consensus), high contradictions = low score (chaos)
  const score = Math.round(Math.max(10, 90 - ratio * 200));
  return { score: Math.min(90, score), ratio };
}

/**
 * Signal D: Market Movement.
 * Maps 24h change to 0-100.
 */
function computeMarketSignal(changePct: number | null): number | null {
  if (changePct === null || changePct === undefined) return null;
  // Clamp to [-25%, +25%] and map to 0-100
  const clamped = Math.max(-25, Math.min(25, changePct));
  return Math.round(50 + clamped * 2);
}

/**
 * Signal E: Bias Polarity Spread.
 * Std dev of covering sources' bias positions (0-6 scale).
 */
function computeBiasSpreadSignal(items: FeedItem[]): number {
  const biases: SourceBias[] = [];
  const seenSources = new Set<string>();

  for (const item of items) {
    for (const sourceName of itemSourceNames(item)) {
      if (seenSources.has(sourceName)) continue;
      seenSources.add(sourceName);
      const bias = getSourceBias(sourceName);
      if (bias) biases.push(bias);
    }
  }

  if (biases.length < 2) return 50;

  const positions = biases.map((b) => biasToPosition(b.bias));
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance = positions.reduce((sum, p) => sum + (p - mean) ** 2, 0) / positions.length;
  const stdDev = Math.sqrt(variance);

  // stdDev ranges 0 (all same bias) to ~3 (full spectrum)
  // Higher spread → more contentious → allow more extreme scores
  return Math.round(Math.min(95, 30 + stdDev * 22));
}

// ── Severity Fallback (keyword-based) ────────────────────────────────────────

const HIGH_SEVERITY_TERMS = new Set([
  "kill", "killed", "killing", "death", "deaths", "dead", "massacre", "casualties",
  "wounded", "bombing", "bomb", "airstrike", "missile", "invasion", "genocide",
  "famine", "starvation", "refugee", "displaced", "humanitarian", "catastrophe",
  "disaster", "earthquake", "tsunami", "flood", "wildfire", "pandemic", "epidemic",
  "nuclear", "radiation", "chemical", "bioweapon", "terrorism", "hostage",
  "trafficking", "slavery", "torture", "persecution", "ethnic", "cleansing",
]);

const MED_SEVERITY_TERMS = new Set([
  "war", "conflict", "crisis", "recession", "depression", "sanctions", "embargo",
  "protest", "riot", "unrest", "collapse", "default", "bankruptcy", "layoffs",
  "inflation", "pollution", "drought", "corruption", "fraud", "indictment",
  "violation", "abuse", "crackdown", "surveillance", "censorship",
]);

/**
 * Rough keyword-based severity estimate when Claude API is unavailable.
 */
function estimateKeywordSeverity(items: FeedItem[]): number {
  if (items.length === 0) return 20;

  let highHits = 0;
  let medHits = 0;
  let totalWords = 0;

  for (const item of items.slice(0, 50)) {
    const text = `${item.title} ${item.description || ""}`.toLowerCase();
    const words = text.split(/\W+/).filter(Boolean);
    totalWords += words.length;

    for (const word of words) {
      if (HIGH_SEVERITY_TERMS.has(word)) highHits++;
      if (MED_SEVERITY_TERMS.has(word)) medHits++;
    }
  }

  if (totalWords === 0) return 20;

  const density = (highHits * 2 + medHits) / totalWords;
  // Map density to 0-100: typical density ranges 0-0.05
  return Math.round(Math.min(95, Math.max(5, density * 1500)));
}

// ── Composite Score ─────────────────────────────────────────────────────────

function computeCompositeScore(signals: TopicSignals): number {
  const hasMarket = signals.marketScore !== null;

  // Severity is inverted: high severity (war, crisis) pulls score DOWN
  const invertedSeverity = 100 - signals.severityScore;

  const weights = hasMarket
    ? { sentiment: 0.30, severity: 0.15, volume: 0.15, contradiction: 0.10, market: 0.20, bias: 0.10 }
    : { sentiment: 0.30, severity: 0.20, volume: 0.18, contradiction: 0.10, market: 0.00, bias: 0.12 };

  const raw =
    signals.sentimentScore * weights.sentiment +
    invertedSeverity * weights.severity +
    signals.volumeScore * weights.volume +
    signals.contradictionScore * weights.contradiction +
    (signals.marketScore ?? 0) * weights.market +
    signals.biasSpreadScore * weights.bias;

  // Contradiction dampening: halved (Claude handles ambiguity better than keywords)
  const dampFactor = 1 - signals.contradictionRatio * 0.15;
  const dampened = 50 + (raw - 50) * Math.max(0.3, dampFactor);

  return Math.round(Math.max(0, Math.min(100, dampened)));
}

// ── Topic Sentiment Computation ─────────────────────────────────────────────

export function matchesTopicDefinition(
  item: Pick<FeedItem, "title" | "description">,
  topic: TopicDefinition,
): boolean {
  const text = `${item.title} ${item.description || ""}`;
  return topic.pattern.test(text);
}

function computeTopicSentiment(
  topic: TopicDefinition,
  allItems: FeedItem[],
  marketData: MarketData | null,
  previousScore: number | null,
  aiScores: Record<string, AITopicScore> | null,
): TopicSentimentResult {
  const items = allItems.filter((item) => matchesTopicDefinition(item, topic));

  // Unique sources
  const sources = new Set(items.flatMap((item) => itemSourceNames(item)));
  const topSources = Array.from(sources).slice(0, 5);
  const rawArticleCount = items.reduce(
    (sum, item) => sum + (item.rawArticleCount ?? 1),
    0
  );

  // Use Claude AI scores if available, otherwise fall back to keyword lexicon
  const aiScore = aiScores?.[topic.slug];
  const sentimentScore = aiScore?.sentiment ?? computeSentimentSignal(items);
  const severityScore = aiScore?.severity ?? estimateKeywordSeverity(items);

  const volumeScore = computeVolumeSignal(items);
  const { score: contradictionScore, ratio: contradictionRatio } = computeContradictionSignal(items);
  const marketChange = topic.marketId && marketData
    ? (marketData.priceChanges[topic.marketId] ?? null)
    : null;
  const marketScore = computeMarketSignal(marketChange);
  const biasSpreadScore = computeBiasSpreadSignal(items);

  const signals: TopicSignals = {
    sentimentScore,
    severityScore,
    volumeScore,
    contradictionScore,
    contradictionRatio,
    marketScore,
    biasSpreadScore,
  };

  const score = computeCompositeScore(signals);
  const trend = previousScore !== null ? score - previousScore : 0;

  return {
    slug: topic.slug,
    displayName: topic.displayName,
    symbol: topic.symbol,
    category: topic.category,
    score,
    previousScore,
    trend,
    signals,
    articleCount: rawArticleCount,
    eventCount: items.length,
    sourceCount: sources.size,
    topSources,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Full Snapshot ───────────────────────────────────────────────────────────

/**
 * Compute a complete sentiment snapshot across all topics.
 * Accepts optional AI scores (Claude-powered sentiment + severity per topic).
 */
export function computeSentimentSnapshot(
  allItems: FeedItem[],
  marketData: MarketData | null,
  previousSnapshot: SentimentSnapshot | null,
  aiScores?: Record<string, AITopicScore> | null,
): SentimentSnapshot {
  const previousScores = new Map<string, number>();
  if (previousSnapshot) {
    for (const topic of previousSnapshot.topics) {
      previousScores.set(topic.slug, topic.score);
    }
  }

  const topics = TOPIC_TAXONOMY.map((topic) =>
    computeTopicSentiment(
      topic,
      allItems,
      marketData,
      previousScores.get(topic.slug) ?? null,
      aiScores ?? null,
    ),
  );

  // Global score: weighted average by article count
  let weightedSum = 0;
  let totalArticles = 0;
  for (const t of topics) {
    if (t.articleCount > 0) {
      weightedSum += t.score * t.articleCount;
      totalArticles += t.articleCount;
    }
  }
  const globalScore = totalArticles > 0 ? Math.round(weightedSum / totalArticles) : 50;

  const prevGlobal = previousSnapshot?.globalScore ?? null;
  const globalTrend = prevGlobal !== null ? globalScore - prevGlobal : 0;

  return {
    generatedAt: new Date().toISOString(),
    topics,
    globalScore,
    globalTrend,
    feedItemsScanned: allItems.length,
    corpusMode: "feed",
  };
}

// ── Market Data Fetcher ─────────────────────────────────────────────────────

const COINGECKO_IDS = TOPIC_TAXONOMY
  .filter((t) => t.marketId)
  .map((t) => t.marketId!)
  .join(",");

/**
 * Fetch 24h price changes from CoinGecko.
 */
async function fetchMarketDataUncached(): Promise<MarketData> {
  if (!COINGECKO_IDS) return { priceChanges: {} };

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PooterWorld/1.0 (+https://pooter.world)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return { priceChanges: {} };

    const data = await res.json() as Record<string, { usd_24h_change?: number }>;
    const priceChanges: Record<string, number> = {};

    for (const [id, info] of Object.entries(data)) {
      if (typeof info?.usd_24h_change === "number") {
        priceChanges[id] = info.usd_24h_change;
      }
    }

    return { priceChanges };
  } catch {
    return { priceChanges: {} };
  }
}

export async function fetchMarketData(): Promise<MarketData> {
  return loadTtlValue(
    marketDataCache,
    "market-data",
    MARKET_DATA_CACHE_TTL_MS,
    fetchMarketDataUncached,
  );
}

// ── Sentiment Label ─────────────────────────────────────────────────────────

export function sentimentLabel(score: number): string {
  if (score <= 15) return "Extreme Fear";
  if (score <= 30) return "Fear";
  if (score <= 42) return "Bearish";
  if (score <= 58) return "Neutral";
  if (score <= 70) return "Optimistic";
  if (score <= 85) return "Bullish";
  return "Extreme Optimism";
}

export function trendArrow(trend: number): string {
  if (trend > 3) return "▲";
  if (trend < -3) return "▼";
  return "—";
}

export function trendArrowPercent(pctChange: number | null): string {
  if (pctChange === null) return "\u2014";
  if (pctChange > 1) return "\u25B2";
  if (pctChange < -1) return "\u25BC";
  return "\u2014";
}

export function formatPercentTrend(pctChange: number | null): string {
  if (pctChange === null) return "\u2014";
  const sign = pctChange > 0 ? "+" : "";
  return `${sign}${pctChange.toFixed(1)}%`;
}
