/**
 * pattern-detector.ts — LLM-powered chart pattern recognition.
 *
 * Sends candle data + indicator readings to the AI provider (Agent Hub / Groq)
 * and asks it to identify chart patterns (H&S, double tops, triangles, etc.).
 *
 * Returns structured JSON with pattern names, confidence, and direction.
 */

import { generateTextForTask } from "../ai-provider";
import type { Candle } from "./hyperliquid";
import { fetchCandles } from "./hyperliquid";
import type { TechnicalSignal } from "./technical";
import type { TraderExecutionConfig } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface DetectedPattern {
  name: string;
  confidence: number;
  direction: "long" | "short" | "neutral";
  description: string;
}

export interface PatternDetectionResult {
  symbol: string;
  timestamp: number;
  patterns: DetectedPattern[];
  overallDirection: "long" | "short" | "neutral";
  overallConfidence: number;
  reasoning: string;
  llmModel: string;
  llmProvider: string;
}

/* ═══════════════════  Prompt Construction  ═══════════════════ */

function compressCandles(candles: Candle[]): string {
  // Compact format: [timestamp, open, high, low, close, volume]
  // Use last 50 candles to keep tokens low (~1500 tokens)
  const recent = candles.slice(-50);
  const rows = recent.map((c) => [
    Math.floor(c.timestamp / 60000), // minutes since epoch (saves digits)
    +c.open.toFixed(2),
    +c.high.toFixed(2),
    +c.low.toFixed(2),
    +c.close.toFixed(2),
    Math.round(c.volume),
  ]);
  return JSON.stringify(rows);
}

function buildIndicatorSummary(tech: TechnicalSignal): string {
  const { indicators: ind } = tech;
  return [
    `RSI(14): ${ind.rsi14.toFixed(1)}`,
    `MACD: hist=${ind.macd.histogram.toFixed(2)}, cross=${ind.macd.crossover}`,
    `Ichimoku: price ${ind.ichimoku.priceVsCloud} cloud (${ind.ichimoku.cloudColor}), TK=${ind.ichimoku.tenkanSen > ind.ichimoku.kijunSen ? "bullish" : "bearish"}`,
    `EMA: 9=${ind.ema.ema9.toFixed(2)}, 21=${ind.ema.ema21.toFixed(2)}, 55=${ind.ema.ema55.toFixed(2)}, align=${ind.ema.trendAlignment}`,
    `Bollinger: %B=${ind.bollinger.percentB.toFixed(2)}, BW=${ind.bollinger.bandwidth.toFixed(4)}`,
    `Volume: ratio=${ind.volume.volumeRatio.toFixed(2)}, VWAP=${ind.volume.vwap.toFixed(2)}`,
  ].join("\n");
}

const SYSTEM_PROMPT = `You are a quantitative technical analyst for crypto perpetual futures. Analyze the provided market data and identify chart patterns.

Return ONLY valid JSON matching this exact schema (no markdown, no explanation outside JSON):
{
  "patterns": [
    {
      "name": "pattern_name",
      "confidence": 0.0 to 1.0,
      "direction": "long" | "short" | "neutral",
      "description": "brief explanation"
    }
  ],
  "overallDirection": "long" | "short" | "neutral",
  "overallConfidence": 0.0 to 1.0,
  "reasoning": "1-2 sentence summary"
}

Common patterns to look for: head_and_shoulders, inverse_head_and_shoulders, double_top, double_bottom, ascending_triangle, descending_triangle, symmetrical_triangle, bull_flag, bear_flag, rising_wedge, falling_wedge, cup_and_handle, channel_breakout, support_bounce, resistance_rejection.

If no clear pattern exists, return overallDirection "neutral" with low confidence.`;

/* ═══════════════════  Main export  ═══════════════════ */

export async function detectPatterns(
  config: TraderExecutionConfig,
  symbol: string,
  technicalSignal: TechnicalSignal,
  candles?: Candle[],
): Promise<PatternDetectionResult> {
  const candleData = candles ?? (await fetchCandles(config, symbol, "15m", 50));

  const userPrompt = [
    `Asset: ${symbol}, Interval: 15m`,
    `Candles (last ${candleData.length}, format: [min_epoch, O, H, L, C, V]):`,
    compressCandles(candleData),
    "",
    "Indicator readings:",
    buildIndicatorSummary(technicalSignal),
    "",
    "Identify all recognizable chart patterns and their trading implications.",
  ].join("\n");

  try {
    const result = await generateTextForTask({
      task: "tradingPatternDetection",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 500,
      temperature: 0.1,
      timeoutMs: 8000,
    });

    const parsed = parseResponse(result.text);

    return {
      symbol,
      timestamp: Date.now(),
      patterns: parsed.patterns,
      overallDirection: parsed.overallDirection,
      overallConfidence: parsed.overallConfidence,
      reasoning: parsed.reasoning,
      llmModel: result.model,
      llmProvider: result.provider,
    };
  } catch (error) {
    // LLM failure is non-fatal — return neutral
    return {
      symbol,
      timestamp: Date.now(),
      patterns: [],
      overallDirection: "neutral",
      overallConfidence: 0,
      reasoning: `LLM pattern detection failed: ${error instanceof Error ? error.message : String(error)}`,
      llmModel: "none",
      llmProvider: "none",
    };
  }
}

/* ═══════════════════  Response Parsing  ═══════════════════ */

function parseResponse(text: string): {
  patterns: DetectedPattern[];
  overallDirection: "long" | "short" | "neutral";
  overallConfidence: number;
  reasoning: string;
} {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const data = JSON.parse(cleaned);

    const patterns: DetectedPattern[] = Array.isArray(data.patterns)
      ? data.patterns
          .filter((p: unknown) => p && typeof p === "object")
          .map((p: Record<string, unknown>) => ({
            name: String(p.name ?? "unknown"),
            confidence: clamp(Number(p.confidence) || 0, 0, 1),
            direction: validateDirection(String(p.direction ?? "neutral")),
            description: String(p.description ?? ""),
          }))
      : [];

    return {
      patterns,
      overallDirection: validateDirection(String(data.overallDirection ?? "neutral")),
      overallConfidence: clamp(Number(data.overallConfidence) || 0, 0, 1),
      reasoning: String(data.reasoning ?? "No reasoning provided"),
    };
  } catch {
    return {
      patterns: [],
      overallDirection: "neutral",
      overallConfidence: 0,
      reasoning: "Failed to parse LLM response as JSON",
    };
  }
}

function validateDirection(dir: string): "long" | "short" | "neutral" {
  if (dir === "long" || dir === "bullish") return "long";
  if (dir === "short" || dir === "bearish") return "short";
  return "neutral";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
