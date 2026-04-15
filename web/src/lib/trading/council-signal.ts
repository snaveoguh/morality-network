/**
 * council-signal.ts — Multi-agent "Council of Analysts" deliberation engine.
 *
 * Inspired by TradingAgents (Tauric Research) multi-agent LLM framework.
 * Four analyst personas each produce a structured argument — thesis, data
 * points, counter-arguments, and vulnerabilities — not just a vote.
 *
 * The trade decision comes from argument quality, not vote count.
 * A well-argued bear case can override a bullish composite signal.
 *
 * Personas:
 *   1. Technical Analyst — price action, indicators, patterns
 *   2. Fundamental Analyst — macro conditions, on-chain metrics, fear/greed
 *   3. Sentiment Analyst — news, social, funding rates
 *   4. Risk Manager — position sizing, stop placement, portfolio exposure
 */

import { generateTextForTask } from "../ai-provider";
import { hasAIProviderForTask } from "../ai-models";
import type { TechnicalSignal } from "./technical";
import type { MarketDataBundle } from "./market-signals";
import type { AggregatedMarketSignal } from "./signals";
import {
  type DeliberationRecord,
  type DeliberationArgument,
  computeArgumentQuality,
  saveDeliberationRecord,
  cacheDeliberation,
  getLatestDeliberation,
  getCachedDeliberation,
} from "./deliberation";

/* ═══════════════════════  Legacy types (backward compat)  ═══════════════════════ */

export interface CouncilVote {
  persona: string;
  vote: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
}

export interface CouncilSignal {
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  votes: CouncilVote[];
  consensus: string;
  reasons: string[];
}

/* ═══════════════════════  Prompt  ═══════════════════════ */

function buildDeliberationPrompt(args: {
  symbol: string;
  price: number;
  technical: TechnicalSignal | null;
  marketData: MarketDataBundle | null;
  newsSignal: AggregatedMarketSignal | null;
}): string {
  const { symbol, price, technical, marketData, newsSignal } = args;

  const techSummary = technical
    ? `Direction: ${technical.direction}, Strength: ${technical.strength.toFixed(2)}, RSI: ${technical.indicators.rsi14.toFixed(1)}, MACD: ${technical.indicators.macd.histogram > 0 ? "bullish" : "bearish"} (histogram ${technical.indicators.macd.histogram.toFixed(4)}), EMA: ${technical.indicators.ema.trendAlignment}, Bollinger %B: ${technical.indicators.bollinger.percentB.toFixed(2)}`
    : "Unavailable";

  const fgValue = marketData?.fearGreed.value ?? "N/A";
  const fgDir = marketData?.fearGreed.direction ?? "N/A";
  const fundingRate = marketData?.funding.value
    ? `${(marketData.funding.value * 100).toFixed(4)}%/8h`
    : "N/A";
  const fundingDir = marketData?.funding.direction ?? "N/A";
  const oiDir = marketData?.openInterest?.direction ?? "N/A";

  const newsSummary = newsSignal
    ? `Direction: ${newsSignal.direction}, Score: ${newsSignal.score.toFixed(2)}, Claims: ${newsSignal.supportingClaims.slice(0, 3).join("; ")}`
    : "No significant news signal";

  return `You are a council of 4 expert trading analysts deliberating on ${symbol} at $${price.toFixed(2)}.

MARKET DATA:
- Technical: ${techSummary}
- Fear & Greed Index: ${fgValue}/100 (signal: ${fgDir})
- HL Funding Rate: ${fundingRate} (signal: ${fundingDir})
- Open Interest: ${oiDir}
- News: ${newsSummary}

INSTRUCTIONS:
Each analyst must produce a STRUCTURED ARGUMENT, not just a vote. Arguments must:
1. State a position (LONG, SHORT, or HOLD)
2. Provide a 2-3 sentence thesis citing SPECIFIC data points
3. List the exact data points referenced (numbers, not vague descriptions)
4. Optionally rebut one other analyst's position
5. State what would falsify their thesis (specific, measurable conditions)

After all 4 arguments, synthesize the key contention (the main point of disagreement) and the winning position with a summary.

Respond ONLY with this JSON format, no other text:
{
  "arguments": [
    {
      "persona": "Technical Analyst",
      "position": "LONG|SHORT|HOLD",
      "conviction": 0-100,
      "thesis": "2-3 sentences with specific data points...",
      "dataPoints": ["RSI 42.3", "MACD histogram +0.4", "200 EMA $3420"],
      "counterTo": null or "persona name being rebutted",
      "vulnerabilities": ["specific condition that invalidates this thesis"]
    },
    {"persona": "Fundamental Analyst", ...},
    {"persona": "Sentiment Analyst", ...},
    {"persona": "Risk Manager", ...}
  ],
  "keyContention": "One sentence: the core disagreement between analysts",
  "winningPosition": "LONG|SHORT|HOLD",
  "winningSummary": "2-3 sentences: why this position wins the debate"
}`;
}

/* ═══════════════════════  Parse LLM Response  ═══════════════════════ */

interface RawDeliberationResponse {
  arguments: Array<{
    persona: string;
    position: string;
    conviction: number;
    thesis: string;
    dataPoints: string[];
    counterTo: string | null;
    vulnerabilities: string[];
  }>;
  keyContention: string;
  winningPosition: string;
  winningSummary: string;
}

function parsePosition(raw: string): "LONG" | "SHORT" | "HOLD" {
  const upper = (raw || "").toUpperCase();
  if (upper === "LONG" || upper === "BUY") return "LONG";
  if (upper === "SHORT" || upper === "SELL") return "SHORT";
  return "HOLD";
}

/* ═══════════════════════  Main Deliberation  ═══════════════════════ */

export async function runCouncilDeliberation(args: {
  symbol: string;
  price: number;
  technical: TechnicalSignal | null;
  marketData: MarketDataBundle | null;
  newsSignal: AggregatedMarketSignal | null;
}): Promise<DeliberationRecord | null> {
  const { symbol, price, technical, marketData, newsSignal } = args;

  // Check cache first (Redis then in-memory)
  const cached = await getLatestDeliberation(symbol).catch(() => null) ?? getCachedDeliberation(symbol);
  if (cached && Date.now() - cached.timestamp < 10 * 60_000) {
    return cached;
  }

  if (!hasAIProviderForTask("councilDeliberation")) {
    return null;
  }

  try {
    const prompt = buildDeliberationPrompt(args);
    const result = await generateTextForTask({
      task: "councilDeliberation",
      user: prompt,
      maxTokens: 1024,
      temperature: 0.5,
      timeoutMs: 12_000,
    });

    const raw = result?.text;
    if (!raw) return null;

    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as RawDeliberationResponse;

    if (!parsed.arguments || !Array.isArray(parsed.arguments)) return null;

    const deliberationArgs: DeliberationArgument[] = parsed.arguments.map((a) => ({
      persona: a.persona || "Unknown",
      position: parsePosition(a.position),
      conviction: Math.max(0, Math.min(100, a.conviction || 0)),
      thesis: a.thesis || "",
      dataPoints: Array.isArray(a.dataPoints) ? a.dataPoints : [],
      counterToPersona: a.counterTo || null,
      vulnerabilities: Array.isArray(a.vulnerabilities) ? a.vulnerabilities : [],
    }));

    const argumentQuality = computeArgumentQuality(deliberationArgs);
    const winningPosition = parsePosition(parsed.winningPosition);

    const record: DeliberationRecord = {
      id: `${symbol}-${Date.now()}`,
      symbol,
      price,
      timestamp: Date.now(),
      arguments: deliberationArgs,
      winningThesis: {
        position: winningPosition,
        argumentQuality,
        summary: parsed.winningSummary || "",
        keyContention: parsed.keyContention || "",
      },
      marketContext: {
        technicalDirection: technical?.direction ?? null,
        newsDirection: newsSignal?.direction ?? null,
        fundingRate: marketData?.funding.value ?? null,
        fearGreedIndex: marketData?.fearGreed.value ?? null,
        walletFlowDirection: null,
      },
      falsifiableAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    };

    // Persist to Redis and in-memory cache
    cacheDeliberation(record);
    saveDeliberationRecord(record).catch((e) =>
      console.warn("[council] Redis save failed:", e instanceof Error ? e.message : e),
    );

    console.log(
      `[council] ${symbol}: ${winningPosition} quality=${argumentQuality.toFixed(2)} | ` +
      deliberationArgs.map((a) => `${a.persona.split(" ")[0]}=${a.position}(${a.conviction})`).join(" ") +
      ` | contention: ${parsed.keyContention?.slice(0, 80) || "none"}`,
    );

    return record;
  } catch (err) {
    console.warn(`[council] Deliberation failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/* ═══════════════════════  Backward-compat wrapper  ═══════════════════════ */

/**
 * Legacy wrapper — returns the old CouncilSignal shape.
 * Use runCouncilDeliberation() for the new DeliberationRecord.
 */
export async function fetchCouncilSignal(args: {
  symbol: string;
  price: number;
  technical: TechnicalSignal | null;
  marketData: MarketDataBundle | null;
  newsSignal: AggregatedMarketSignal | null;
}): Promise<CouncilSignal | null> {
  const record = await runCouncilDeliberation(args);
  if (!record) return null;

  const votes: CouncilVote[] = record.arguments.map((a) => ({
    persona: a.persona,
    vote: a.position === "LONG" ? "BUY" : a.position === "SHORT" ? "SELL" : "HOLD",
    confidence: a.conviction,
    reasoning: a.thesis,
  }));

  const positionToDirection = (p: "LONG" | "SHORT" | "HOLD"): "long" | "short" | "neutral" =>
    p === "LONG" ? "long" : p === "SHORT" ? "short" : "neutral";

  return {
    symbol: record.symbol,
    timestamp: record.timestamp,
    direction: positionToDirection(record.winningThesis.position),
    confidence: record.winningThesis.argumentQuality,
    votes,
    consensus: record.winningThesis.summary,
    reasons: [
      `Council deliberation: ${record.winningThesis.position} (quality: ${record.winningThesis.argumentQuality.toFixed(2)})`,
      record.winningThesis.keyContention,
    ],
  };
}
