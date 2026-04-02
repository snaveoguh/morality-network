/**
 * composite-signal.ts — Merges technical, AI pattern, and news signals.
 *
 * Weights (configurable via env vars):
 *   Technical: 40%  |  AI Pattern: 30%  |  News: 30%
 *
 * If a source is unavailable, its weight is redistributed proportionally.
 * Below minSignalConfidence = no trade. Requires 2-of-3 agreement on direction.
 */

import type { TechnicalSignal } from "./technical";
import type { PatternDetectionResult } from "./pattern-detector";
import type { AggregatedMarketSignal } from "./signals";
import type { MarketDataBundle } from "./market-signals";
import type { WalletFlowSignal } from "./wallet-flow";
import type { WebIntelligenceSignal } from "./web-intelligence";
import type { SignalWeights } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface CompositeSignal {
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  /** overall confidence 0-1 */
  confidence: number;
  components: {
    technical: {
      direction: "long" | "short" | "neutral";
      strength: number;
      confidence: number;
      weight: number;
    } | null;
    pattern: {
      direction: "long" | "short" | "neutral";
      confidence: number;
      patterns: string[];
      weight: number;
    } | null;
    news: {
      direction: "long" | "short" | "neutral";
      score: number;
      weight: number;
    } | null;
    marketData: {
      direction: "long" | "short" | "neutral";
      strength: number;
      confidence: number;
      weight: number;
      sources: string[];
    } | null;
    walletFlow: {
      direction: "long" | "short" | "neutral";
      strength: number;
      confidence: number;
      weight: number;
      whaleNetExposure: number;
      whalesLong: number;
      whalesShort: number;
    } | null;
    webIntelligence: {
      direction: "long" | "short" | "neutral";
      strength: number;
      confidence: number;
      weight: number;
      resistanceLevels: number[];
      supportLevels: number[];
      regime: "trending" | "mean-reverting" | "uncertain";
    } | null;
  };
  /** 2-of-6 agreement check (technical, pattern, news, market data, wallet flow, web intel) */
  agreementMet: boolean;
  reasons: string[];
}

/* ═══════════════════  Default Weights  ═══════════════════ */

function getWeights(): Required<SignalWeights> {
  const t = parseFloat(process.env.SIGNAL_WEIGHT_TECHNICAL || "0.26");
  const p = parseFloat(process.env.SIGNAL_WEIGHT_PATTERN || "0.20");
  const n = parseFloat(process.env.SIGNAL_WEIGHT_NEWS || "0.20");
  const m = parseFloat(process.env.SIGNAL_WEIGHT_MARKET_DATA || "0.14");
  const w = parseFloat(process.env.SIGNAL_WEIGHT_WALLET_FLOW || "0.08");
  const wi = parseFloat(process.env.SIGNAL_WEIGHT_WEB_INTEL || "0.12");
  const total = t + p + n + m + w + wi;
  return {
    technical: t / total,
    pattern: p / total,
    news: n / total,
    marketData: m / total,
    walletFlow: w / total,
    webIntelligence: wi / total,
  };
}

/* ═══════════════════  Helpers  ═══════════════════ */

type Direction = "long" | "short" | "neutral";

function newsToDirection(d: "bullish" | "bearish"): Direction {
  return d === "bullish" ? "long" : "short";
}

function directionScore(dir: Direction): number {
  if (dir === "long") return 1;
  if (dir === "short") return -1;
  return 0;
}

/* ═══════════════════  Main export  ═══════════════════ */

export function computeCompositeSignal(args: {
  symbol: string;
  technical: TechnicalSignal | null;
  pattern: PatternDetectionResult | null;
  newsSignal: AggregatedMarketSignal | null;
  marketData?: MarketDataBundle | null;
  walletFlow?: WalletFlowSignal | null;
  webIntelligence?: WebIntelligenceSignal | null;
  minConfidence: number;
  /** Override weights from self-learning module */
  overrideWeights?: SignalWeights;
}): CompositeSignal {
  const { symbol, technical, pattern, newsSignal, marketData, walletFlow, webIntelligence, minConfidence, overrideWeights } = args;
  const baseWeights = overrideWeights
    ? { ...overrideWeights, marketData: overrideWeights.marketData ?? 0.14, walletFlow: overrideWeights.walletFlow ?? 0.08, webIntelligence: overrideWeights.webIntelligence ?? 0.12 }
    : getWeights();

  // Combine market data sub-signals into a single direction + strength
  const marketDataCombined = combineMarketData(marketData ?? null);

  // Determine which sources are available
  const hasTechnical = technical !== null && technical.direction !== "neutral";
  const hasPattern = pattern !== null && pattern.overallDirection !== "neutral";
  const hasNews = newsSignal !== null;
  const hasMarketData = marketDataCombined !== null && marketDataCombined.direction !== "neutral";
  const hasWalletFlow = walletFlow !== null && walletFlow !== undefined && walletFlow.direction !== "neutral";
  const hasWebIntel = webIntelligence !== null && webIntelligence !== undefined && webIntelligence.direction !== "neutral";

  // Redistribute weights if sources are missing
  let wTech = hasTechnical ? baseWeights.technical : 0;
  let wPat = hasPattern ? baseWeights.pattern : 0;
  let wNews = hasNews ? baseWeights.news : 0;
  let wMkt = hasMarketData ? baseWeights.marketData : 0;
  let wWf = hasWalletFlow ? (baseWeights.walletFlow ?? 0.08) : 0;
  let wWi = hasWebIntel ? (baseWeights.webIntelligence ?? 0.12) : 0;
  const totalWeight = wTech + wPat + wNews + wMkt + wWf + wWi;

  if (totalWeight > 0) {
    wTech /= totalWeight;
    wPat /= totalWeight;
    wNews /= totalWeight;
    wMkt /= totalWeight;
    wWf /= totalWeight;
    wWi /= totalWeight;
  }

  // Compute weighted directional score (-1 to +1)
  let weightedScore = 0;
  let weightedConfidence = 0;
  const reasons: string[] = [];

  if (hasTechnical && technical) {
    const techScore = directionScore(technical.direction) * technical.strength;
    weightedScore += techScore * wTech;
    weightedConfidence += technical.confidence * wTech;
    reasons.push(`Technical: ${technical.direction} (strength ${technical.strength.toFixed(2)})`);
  }

  if (hasPattern && pattern) {
    const patScore = directionScore(pattern.overallDirection) * pattern.overallConfidence;
    weightedScore += patScore * wPat;
    weightedConfidence += pattern.overallConfidence * wPat;
    const patternNames = pattern.patterns.map((p) => p.name).join(", ");
    reasons.push(`Patterns: ${pattern.overallDirection} [${patternNames || "none"}]`);
  }

  if (hasNews && newsSignal) {
    const newsDir = newsToDirection(newsSignal.direction);
    const newsStrength = Math.min(1, newsSignal.score / 2); // normalize score to 0-1 range
    const newsScore = directionScore(newsDir) * newsStrength;
    weightedScore += newsScore * wNews;
    weightedConfidence += newsStrength * wNews;
    reasons.push(`News: ${newsSignal.direction} (score ${newsSignal.score.toFixed(2)})`);
  }

  if (hasMarketData && marketDataCombined) {
    const mktScore = directionScore(marketDataCombined.direction) * marketDataCombined.strength;
    weightedScore += mktScore * wMkt;
    weightedConfidence += marketDataCombined.confidence * wMkt;
    reasons.push(...marketDataCombined.reasons);
  }

  if (hasWalletFlow && walletFlow) {
    const wfScore = directionScore(walletFlow.direction) * walletFlow.strength;
    weightedScore += wfScore * wWf;
    weightedConfidence += walletFlow.confidence * wWf;
    reasons.push(...walletFlow.reasons);
  }

  if (hasWebIntel && webIntelligence) {
    const wiScore = directionScore(webIntelligence.direction) * webIntelligence.strength;
    weightedScore += wiScore * wWi;
    weightedConfidence += webIntelligence.confidence * wWi;
    reasons.push(...webIntelligence.reasons);
  }

  // Determine direction from weighted score
  let direction: Direction = "neutral";
  if (weightedScore > 0.05) direction = "long";
  else if (weightedScore < -0.05) direction = "short";

  // Confidence = weighted confidence + boost from agreement
  const confidence = Math.min(1, weightedConfidence);

  // Agreement check: require 2+ sources to agree on direction
  const directions: Direction[] = [];
  if (hasTechnical && technical) directions.push(technical.direction);
  if (hasPattern && pattern) directions.push(pattern.overallDirection);
  if (hasNews && newsSignal) directions.push(newsToDirection(newsSignal.direction));
  if (hasMarketData && marketDataCombined) directions.push(marketDataCombined.direction);
  if (hasWalletFlow && walletFlow) directions.push(walletFlow.direction);
  if (hasWebIntel && webIntelligence) directions.push(webIntelligence.direction);

  const longVotes = directions.filter((d) => d === "long").length;
  const shortVotes = directions.filter((d) => d === "short").length;
  const minAgreement = parseInt(process.env.TRADER_MIN_COMPOSITE_AGREEMENT_COUNT ?? "3", 10);
  const agreementMet =
    directions.length <= 1 || // only 1 source = auto-agree
    (direction === "long" && longVotes >= minAgreement) ||
    (direction === "short" && shortVotes >= minAgreement);

  // If no agreement, downgrade to neutral — no position is the best position
  if (!agreementMet) {
    reasons.push(`Direction disagreement — ${minAgreement}-of-${directions.length} agreement not met, forcing neutral`);
    direction = "neutral";
  }

  // Below minimum confidence = neutral
  if (confidence < minConfidence && direction !== "neutral") {
    reasons.push(`Confidence ${confidence.toFixed(2)} below minimum ${minConfidence}`);
    direction = "neutral";
  }

  return {
    symbol,
    timestamp: Date.now(),
    direction,
    confidence: direction === "neutral" ? 0 : confidence,
    components: {
      technical: hasTechnical && technical
        ? { direction: technical.direction, strength: technical.strength, confidence: technical.confidence, weight: wTech }
        : null,
      pattern: hasPattern && pattern
        ? { direction: pattern.overallDirection, confidence: pattern.overallConfidence, patterns: pattern.patterns.map((p) => p.name), weight: wPat }
        : null,
      news: hasNews && newsSignal
        ? { direction: newsToDirection(newsSignal.direction), score: newsSignal.score, weight: wNews }
        : null,
      marketData: hasMarketData && marketDataCombined
        ? { direction: marketDataCombined.direction, strength: marketDataCombined.strength, confidence: marketDataCombined.confidence, weight: wMkt, sources: marketDataCombined.sources }
        : null,
      walletFlow: hasWalletFlow && walletFlow
        ? { direction: walletFlow.direction, strength: walletFlow.strength, confidence: walletFlow.confidence, weight: wWf, whaleNetExposure: walletFlow.whaleNetExposure, whalesLong: walletFlow.whalesLong, whalesShort: walletFlow.whalesShort }
        : null,
      webIntelligence: hasWebIntel && webIntelligence
        ? { direction: webIntelligence.direction, strength: webIntelligence.strength, confidence: webIntelligence.confidence, weight: wWi, resistanceLevels: webIntelligence.resistanceLevels, supportLevels: webIntelligence.supportLevels, regime: webIntelligence.regime }
        : null,
    },
    agreementMet,
    reasons,
  };
}

/* ═══════════════════  Market Data Combiner  ═══════════════════ */

interface CombinedMarketData {
  direction: Direction;
  strength: number;
  confidence: number;
  reasons: string[];
  sources: string[];
}

/**
 * Combine fear/greed, funding, and OI signals into a single market data signal.
 * Uses majority vote with weighted strength.
 */
function combineMarketData(bundle: MarketDataBundle | null): CombinedMarketData | null {
  if (!bundle) return null;

  const { fearGreed, funding, openInterest } = bundle;
  const signals = [fearGreed, funding, openInterest].filter(
    (s) => s.direction !== "neutral" && s.strength > 0,
  );

  if (signals.length === 0) return null;

  // Weighted vote
  let longScore = 0;
  let shortScore = 0;
  let totalWeight = 0;
  const reasons: string[] = [];
  const sources: string[] = [];

  for (const s of [fearGreed, funding, openInterest]) {
    if (s.direction === "neutral" || s.strength === 0) continue;
    const w = s.confidence * s.strength;
    if (s.direction === "long") longScore += w;
    else shortScore += w;
    totalWeight += w;
    reasons.push(...s.reasons);
    sources.push(s.source);
  }

  if (totalWeight === 0) return null;

  const direction: Direction = longScore > shortScore ? "long" : shortScore > longScore ? "short" : "neutral";
  const dominantScore = Math.max(longScore, shortScore);
  const strength = Math.min(1, dominantScore / totalWeight);
  const confidence = Math.min(1, signals.length / 3); // more sources = more confident

  return { direction, strength, confidence, reasons, sources };
}
