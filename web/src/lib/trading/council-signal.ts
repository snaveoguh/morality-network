/**
 * council-signal.ts — Multi-agent "Council of Analysts" signal.
 *
 * Inspired by TradingAgents (Tauric Research) multi-agent LLM framework.
 * Instead of running separate Python agents, we simulate the council
 * debate in a single structured LLM call via Agent Hub / Groq.
 *
 * The prompt asks the LLM to role-play 4 analyst personas:
 *   1. Technical Analyst — reads price action, indicators, patterns
 *   2. Fundamental Analyst — macro conditions, on-chain metrics, fear/greed
 *   3. Sentiment Analyst — news, social, funding rates
 *   4. Risk Manager — position sizing, stop placement, portfolio exposure
 *
 * Each persona votes BUY/SELL/HOLD with confidence 0-100.
 * Final decision is majority vote with averaged confidence.
 */

import { generateTextForTask } from "../ai-provider";
import { hasAIProviderForTask } from "../ai-models";
import type { TechnicalSignal } from "./technical";
import type { MarketDataBundle } from "./market-signals";
import type { AggregatedMarketSignal } from "./signals";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface CouncilVote {
  persona: string;
  vote: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0-100
  reasoning: string;
}

export interface CouncilSignal {
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  confidence: number; // 0-1
  votes: CouncilVote[];
  consensus: string;
  reasons: string[];
}

/* ═══════════════════  Cache  ═══════════════════ */

const councilCache = new Map<string, { signal: CouncilSignal; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60_000; // 10min — LLM calls are expensive

/* ═══════════════════  Prompt  ═══════════════════ */

function buildCouncilPrompt(args: {
  symbol: string;
  price: number;
  technical: TechnicalSignal | null;
  marketData: MarketDataBundle | null;
  newsSignal: AggregatedMarketSignal | null;
}): string {
  const { symbol, price, technical, marketData, newsSignal } = args;

  const techSummary = technical
    ? `Direction: ${technical.direction}, Strength: ${technical.strength.toFixed(2)}, RSI: ${technical.indicators.rsi14.toFixed(1)}, MACD: ${technical.indicators.macd.histogram > 0 ? "bullish" : "bearish"}, EMA: ${technical.indicators.ema.trendAlignment}`
    : "Unavailable";

  const fgValue = marketData?.fearGreed.value ?? "N/A";
  const fgDir = marketData?.fearGreed.direction ?? "N/A";
  const fundingRate = marketData?.funding.value
    ? `${(marketData.funding.value * 100).toFixed(4)}%/8h`
    : "N/A";
  const fundingDir = marketData?.funding.direction ?? "N/A";

  const newsSummary = newsSignal
    ? `Direction: ${newsSignal.direction}, Score: ${newsSignal.score.toFixed(2)}, Claims: ${newsSignal.supportingClaims.slice(0, 2).join("; ")}`
    : "No significant news signal";

  return `You are a council of 4 expert trading analysts evaluating ${symbol} at $${price.toFixed(2)}.

MARKET DATA:
- Technical: ${techSummary}
- Fear & Greed Index: ${fgValue}/100 (signal: ${fgDir})
- HL Funding Rate: ${fundingRate} (signal: ${fundingDir})
- News: ${newsSummary}

Each analyst must vote BUY, SELL, or HOLD with confidence 0-100 and one sentence of reasoning.

Respond ONLY with this exact JSON format, no other text:
{
  "votes": [
    {"persona": "Technical Analyst", "vote": "BUY|SELL|HOLD", "confidence": 0-100, "reasoning": "..."},
    {"persona": "Fundamental Analyst", "vote": "BUY|SELL|HOLD", "confidence": 0-100, "reasoning": "..."},
    {"persona": "Sentiment Analyst", "vote": "BUY|SELL|HOLD", "confidence": 0-100, "reasoning": "..."},
    {"persona": "Risk Manager", "vote": "BUY|SELL|HOLD", "confidence": 0-100, "reasoning": "..."}
  ],
  "consensus": "One sentence final recommendation"
}`;
}

/* ═══════════════════  Main export  ═══════════════════ */

export async function fetchCouncilSignal(args: {
  symbol: string;
  price: number;
  technical: TechnicalSignal | null;
  marketData: MarketDataBundle | null;
  newsSignal: AggregatedMarketSignal | null;
}): Promise<CouncilSignal | null> {
  const { symbol } = args;

  // Check cache
  const cached = councilCache.get(symbol);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.signal;
  }

  // Check if AI provider is available
  if (!hasAIProviderForTask("tradingPatternDetection")) {
    return null;
  }

  try {
    const prompt = buildCouncilPrompt(args);
    const result = await generateTextForTask({
      task: "tradingPatternDetection",
      user: prompt,
      maxTokens: 512,
      temperature: 0.3,
      timeoutMs: 8_000,
    });

    const raw = result?.text;
    if (!raw) return null;

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      votes: Array<{ persona: string; vote: string; confidence: number; reasoning: string }>;
      consensus: string;
    };

    if (!parsed.votes || !Array.isArray(parsed.votes)) return null;

    const votes: CouncilVote[] = parsed.votes.map((v) => ({
      persona: v.persona,
      vote: (v.vote?.toUpperCase() === "BUY" ? "BUY" : v.vote?.toUpperCase() === "SELL" ? "SELL" : "HOLD") as "BUY" | "SELL" | "HOLD",
      confidence: Math.max(0, Math.min(100, v.confidence || 0)),
      reasoning: v.reasoning || "",
    }));

    // Tally votes
    const buyVotes = votes.filter((v) => v.vote === "BUY");
    const sellVotes = votes.filter((v) => v.vote === "SELL");

    let direction: "long" | "short" | "neutral" = "neutral";
    let avgConfidence = 0;

    if (buyVotes.length > sellVotes.length && buyVotes.length >= 2) {
      direction = "long";
      avgConfidence = buyVotes.reduce((sum, v) => sum + v.confidence, 0) / buyVotes.length / 100;
    } else if (sellVotes.length > buyVotes.length && sellVotes.length >= 2) {
      direction = "short";
      avgConfidence = sellVotes.reduce((sum, v) => sum + v.confidence, 0) / sellVotes.length / 100;
    }

    const signal: CouncilSignal = {
      symbol,
      timestamp: Date.now(),
      direction,
      confidence: avgConfidence,
      votes,
      consensus: parsed.consensus || "",
      reasons: [
        `Council: ${buyVotes.length} BUY / ${sellVotes.length} SELL / ${votes.length - buyVotes.length - sellVotes.length} HOLD → ${direction}`,
        parsed.consensus || "",
      ],
    };

    councilCache.set(symbol, { signal, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(
      `[council] ${symbol}: ${direction} conf=${avgConfidence.toFixed(2)} | ` +
      votes.map((v) => `${v.persona.split(" ")[0]}=${v.vote}(${v.confidence})`).join(" "),
    );

    return signal;
  } catch (err) {
    console.warn(`[council] Failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
