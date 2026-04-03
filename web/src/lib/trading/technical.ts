/**
 * technical.ts — Pure TypeScript technical indicator computation.
 *
 * Fetches candles from Hyperliquid and computes:
 *   RSI(14), Ichimoku Cloud, MACD(12/26/9), EMA crossovers (9/21/55),
 *   Bollinger Bands(20,2), Volume/VWAP.
 *
 * Returns a weighted composite TechnicalSignal used by composite-signal.ts.
 */

import type { Candle } from "./hyperliquid";
import { fetchCandles, getHyperliquidClients } from "./hyperliquid";
import type { TraderExecutionConfig } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface IchimokuReading {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
  cloudColor: "green" | "red";
  priceVsCloud: "above" | "inside" | "below";
}

export interface MACDReading {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "bullish" | "bearish" | "none";
}

export interface EMAReading {
  ema9: number;
  ema21: number;
  ema55: number;
  shortCrossLong: "golden" | "death" | "none";
  trendAlignment: "bullish" | "bearish" | "mixed";
}

export interface BollingerReading {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  bandwidth: number;
}

export interface VolumeReading {
  vwap: number;
  volumeSMA20: number;
  currentVolume: number;
  volumeRatio: number;
  isHighVolume: boolean;
}

export interface TechnicalSignal {
  symbol: string;
  timestamp: number;
  direction: "long" | "short" | "neutral";
  /** strength of the signal (0-1) */
  strength: number;
  /** fraction of indicators that agree (0-1) */
  confidence: number;
  indicators: {
    rsi14: number;
    ichimoku: IchimokuReading;
    macd: MACDReading;
    ema: EMAReading;
    bollinger: BollingerReading;
    volume: VolumeReading;
  };
  reasons: string[];
  candleCount: number;
  interval: string;
}

/* ═══════════════════════  Indicator math  ═══════════════════════ */

export function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  if (data.length === 0) return result;
  const k = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

export function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function highestHigh(highs: number[], period: number, idx: number): number {
  let max = -Infinity;
  const start = Math.max(0, idx - period + 1);
  for (let i = start; i <= idx; i++) max = Math.max(max, highs[i]);
  return max;
}

function lowestLow(lows: number[], period: number, idx: number): number {
  let min = Infinity;
  const start = Math.max(0, idx - period + 1);
  for (let i = start; i <= idx; i++) min = Math.min(min, lows[i]);
  return min;
}

/* ── RSI (Wilder's smoothed) ── */

export function computeRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/* ── Ichimoku Cloud ── */

function computeIchimoku(candles: Candle[]): IchimokuReading {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const idx = candles.length - 1;

  const tenkanSen = (highestHigh(highs, 9, idx) + lowestLow(lows, 9, idx)) / 2;
  const kijunSen = (highestHigh(highs, 26, idx) + lowestLow(lows, 26, idx)) / 2;
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  const senkouSpanB = (highestHigh(highs, 52, idx) + lowestLow(lows, 52, idx)) / 2;
  const chikouSpan = closes[Math.max(0, idx - 26)] ?? closes[idx];

  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);
  const price = closes[idx];

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan,
    cloudColor: senkouSpanA >= senkouSpanB ? "green" : "red",
    priceVsCloud: price > cloudTop ? "above" : price < cloudBottom ? "below" : "inside",
  };
}

/* ── MACD ── */

function computeMACD(closes: number[]): MACDReading {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push((ema12[i] ?? 0) - (ema26[i] ?? 0));
  }
  const signalLine = ema(macdLine, 9);
  const idx = closes.length - 1;
  const prev = Math.max(0, idx - 1);

  const macd = macdLine[idx] ?? 0;
  const signal = signalLine[idx] ?? 0;
  const histogram = macd - signal;
  const prevHistogram = (macdLine[prev] ?? 0) - (signalLine[prev] ?? 0);

  let crossover: "bullish" | "bearish" | "none" = "none";
  if (prevHistogram <= 0 && histogram > 0) crossover = "bullish";
  else if (prevHistogram >= 0 && histogram < 0) crossover = "bearish";

  return { macd, signal, histogram, crossover };
}

/* ── EMA crossovers ── */

export function computeEMAs(closes: number[]): EMAReading {
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  const idx = closes.length - 1;
  const prev = Math.max(0, idx - 1);

  const ema9 = e9[idx] ?? 0;
  const ema21 = e21[idx] ?? 0;
  const ema55 = e55[idx] ?? 0;
  const prevEma9 = e9[prev] ?? 0;
  const prevEma21 = e21[prev] ?? 0;

  let shortCrossLong: "golden" | "death" | "none" = "none";
  if (prevEma9 <= prevEma21 && ema9 > ema21) shortCrossLong = "golden";
  else if (prevEma9 >= prevEma21 && ema9 < ema21) shortCrossLong = "death";

  let trendAlignment: "bullish" | "bearish" | "mixed" = "mixed";
  if (ema9 > ema21 && ema21 > ema55) trendAlignment = "bullish";
  else if (ema9 < ema21 && ema21 < ema55) trendAlignment = "bearish";

  return { ema9, ema21, ema55, shortCrossLong, trendAlignment };
}

/* ── Bollinger Bands ── */

export function computeBollinger(closes: number[], period: number = 20, stdDevMult: number = 2): BollingerReading {
  const smaArr = sma(closes, period);
  const idx = closes.length - 1;
  const middle = smaArr[idx] ?? closes[idx];

  let variance = 0;
  const start = Math.max(0, idx - period + 1);
  for (let i = start; i <= idx; i++) {
    variance += (closes[i] - middle) ** 2;
  }
  variance /= period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMult * stdDev;
  const lower = middle - stdDevMult * stdDev;
  const price = closes[idx];
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0;
  const percentB = upper !== lower ? (price - lower) / (upper - lower) : 0.5;

  return { upper, middle, lower, percentB, bandwidth };
}

/* ── Volume / VWAP ── */

export function computeVolume(candles: Candle[]): VolumeReading {
  const volumes = candles.map((c) => c.volume);
  const volSma = sma(volumes, 20);
  const idx = candles.length - 1;

  // VWAP: cumulative (typical price * volume) / cumulative volume
  let cumulativePV = 0;
  let cumulativeV = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeV += c.volume;
  }
  const vwap = cumulativeV > 0 ? cumulativePV / cumulativeV : candles[idx].close;

  const volumeSMA20 = volSma[idx] ?? 1;
  const currentVolume = volumes[idx];
  const volumeRatio = volumeSMA20 > 0 ? currentVolume / volumeSMA20 : 1;

  return {
    vwap,
    volumeSMA20,
    currentVolume,
    volumeRatio,
    isHighVolume: volumeRatio > 1.5,
  };
}

/* ═══════════════════  Composite Direction Scoring  ═══════════════════ */

interface IndicatorVote {
  name: string;
  weight: number;
  vote: number; // +1 = long, -1 = short, 0 = neutral
  reason: string;
}

function scoreIndicators(
  rsi: number,
  ichimoku: IchimokuReading,
  macd: MACDReading,
  emaReading: EMAReading,
  bollinger: BollingerReading,
  volumeReading: VolumeReading,
  lastClose: number,
): IndicatorVote[] {
  const votes: IndicatorVote[] = [];

  // RSI (15%)
  if (rsi < 35) {
    votes.push({ name: "RSI", weight: 0.15, vote: 1, reason: `RSI ${rsi.toFixed(1)} oversold → long` });
  } else if (rsi > 65) {
    votes.push({ name: "RSI", weight: 0.15, vote: -1, reason: `RSI ${rsi.toFixed(1)} overbought → short` });
  } else {
    votes.push({ name: "RSI", weight: 0.15, vote: 0, reason: `RSI ${rsi.toFixed(1)} neutral` });
  }

  // Ichimoku Cloud (25%) — uses cloud color, TK cross, and price position
  // Cloud color is forward-looking: red cloud = bearish structure even if price is still above
  {
    let vote = 0;
    let reason = "";
    const tkBullish = ichimoku.tenkanSen > ichimoku.kijunSen;
    const tkBearish = ichimoku.tenkanSen < ichimoku.kijunSen;
    const redCloud = ichimoku.cloudColor === "red";
    const greenCloud = ichimoku.cloudColor === "green";

    if (ichimoku.priceVsCloud === "above" && tkBullish && greenCloud) {
      vote = 1;
      reason = "Price above green cloud, TK bullish → strong long";
    } else if (ichimoku.priceVsCloud === "below" && tkBearish && redCloud) {
      vote = -1;
      reason = "Price below red cloud, TK bearish → strong short";
    } else if (ichimoku.priceVsCloud === "above" && tkBullish && redCloud) {
      // Price above cloud but cloud turning red = weakening bullish
      vote = 0.25;
      reason = "Price above cloud but cloud turning red → weakening";
    } else if (ichimoku.priceVsCloud === "above" && tkBearish) {
      // Price above cloud but TK bearish cross = bearish divergence
      vote = -0.25;
      reason = "Price above cloud but TK bearish → divergence, caution";
    } else if (ichimoku.priceVsCloud === "below" && tkBullish) {
      // Price below cloud but TK turning bullish = potential reversal
      vote = -0.25;
      reason = "Price below cloud but TK bullish → weakening bearish";
    } else if (ichimoku.priceVsCloud === "below") {
      vote = -0.5;
      reason = `Price below ${redCloud ? "red" : "green"} cloud → bearish`;
    } else if (ichimoku.priceVsCloud === "above") {
      vote = 0.5;
      reason = `Price above cloud, TK neutral → bullish`;
    } else {
      // Inside cloud = uncertainty
      vote = 0;
      reason = "Price inside cloud → no conviction";
    }
    votes.push({ name: "Ichimoku", weight: 0.20, vote, reason });
  }

  // MACD (22.5%) — primary trend-following indicator
  {
    let vote = 0;
    let reason = "";
    if (macd.crossover === "bullish" || (macd.histogram > 0 && macd.macd > macd.signal)) {
      vote = 1;
      reason = `MACD bullish (hist ${macd.histogram.toFixed(2)}) → long`;
    } else if (macd.crossover === "bearish" || (macd.histogram < 0 && macd.macd < macd.signal)) {
      vote = -1;
      reason = `MACD bearish (hist ${macd.histogram.toFixed(2)}) → short`;
    } else {
      reason = "MACD neutral";
    }
    votes.push({ name: "MACD", weight: 0.225, vote, reason });
  }

  // EMA crossovers (22.5%) — trend direction from moving average structure
  {
    let vote = 0;
    let reason = "";
    if (emaReading.shortCrossLong === "golden" || emaReading.trendAlignment === "bullish") {
      vote = 1;
      reason = `EMA ${emaReading.shortCrossLong === "golden" ? "golden cross" : "bullish alignment"} → long`;
    } else if (emaReading.shortCrossLong === "death" || emaReading.trendAlignment === "bearish") {
      vote = -1;
      reason = `EMA ${emaReading.shortCrossLong === "death" ? "death cross" : "bearish alignment"} → short`;
    } else {
      reason = "EMA mixed";
    }
    votes.push({ name: "EMA", weight: 0.225, vote, reason });
  }

  // Bollinger Bands (10%)
  {
    let vote = 0;
    let reason = "";
    if (bollinger.percentB < 0.2) {
      vote = 1;
      reason = `Bollinger %B ${bollinger.percentB.toFixed(2)} → oversold bounce → long`;
    } else if (bollinger.percentB > 0.8) {
      vote = -1;
      reason = `Bollinger %B ${bollinger.percentB.toFixed(2)} → overbought rejection → short`;
    } else {
      reason = `Bollinger %B ${bollinger.percentB.toFixed(2)} neutral`;
    }
    votes.push({ name: "Bollinger", weight: 0.10, vote, reason });
  }

  // Volume (10%)
  {
    let vote = 0;
    let reason = "";
    if (volumeReading.isHighVolume && lastClose > volumeReading.vwap) {
      vote = 1;
      reason = "High volume + price above VWAP → long";
    } else if (volumeReading.isHighVolume && lastClose < volumeReading.vwap) {
      vote = -1;
      reason = "High volume + price below VWAP → short";
    } else {
      reason = `Volume ratio ${volumeReading.volumeRatio.toFixed(2)} → neutral`;
    }
    votes.push({ name: "Volume", weight: 0.10, vote, reason });
  }

  return votes;
}

/* ═══════════════════  Main export  ═══════════════════ */

export async function fetchTechnicalSignal(
  config: TraderExecutionConfig,
  symbol: string,
  opts?: { interval?: "1m" | "5m" | "15m" | "1h" | "4h"; count?: number },
): Promise<TechnicalSignal> {
  const interval = opts?.interval ?? "15m";
  const count = opts?.count ?? 100;

  const candles = await fetchCandles(config, symbol, interval, count);
  if (candles.length < 55) {
    return {
      symbol,
      timestamp: Date.now(),
      direction: "neutral",
      strength: 0,
      confidence: 0,
      indicators: {
        rsi14: 50,
        ichimoku: { tenkanSen: 0, kijunSen: 0, senkouSpanA: 0, senkouSpanB: 0, chikouSpan: 0, cloudColor: "neutral" as any, priceVsCloud: "inside" },
        macd: { macd: 0, signal: 0, histogram: 0, crossover: "none" },
        ema: { ema9: 0, ema21: 0, ema55: 0, shortCrossLong: "none", trendAlignment: "mixed" },
        bollinger: { upper: 0, middle: 0, lower: 0, percentB: 0.5, bandwidth: 0 },
        volume: { vwap: 0, volumeSMA20: 0, currentVolume: 0, volumeRatio: 1, isHighVolume: false },
      },
      reasons: ["Insufficient candle data"],
      candleCount: candles.length,
      interval,
    };
  }

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  const rsi14 = computeRSI(closes, 14);
  const ichimoku = computeIchimoku(candles);
  const macd = computeMACD(closes);
  const emaReading = computeEMAs(closes);
  const bollinger = computeBollinger(closes, 20, 2);
  const volumeReading = computeVolume(candles);

  const votes = scoreIndicators(rsi14, ichimoku, macd, emaReading, bollinger, volumeReading, lastClose);

  // Weighted sum: positive = bullish, negative = bearish
  let weightedSum = 0;
  let totalWeight = 0;
  let agreeingWeight = 0;
  const majoritySign = votes.reduce((sum, v) => sum + v.vote * v.weight, 0) >= 0 ? 1 : -1;

  for (const v of votes) {
    weightedSum += v.vote * v.weight;
    totalWeight += v.weight;
    if (Math.sign(v.vote) === majoritySign || v.vote === 0) {
      agreeingWeight += v.weight;
    }
  }

  const rawStrength = Math.abs(weightedSum) / (totalWeight || 1);
  const strength = Math.min(1, rawStrength);
  const confidence = agreeingWeight / (totalWeight || 1);

  let direction: "long" | "short" | "neutral" = "neutral";
  if (weightedSum > 0.1) direction = "long";
  else if (weightedSum < -0.1) direction = "short";

  const reasons = votes.filter((v) => v.vote !== 0).map((v) => v.reason);

  return {
    symbol,
    timestamp: Date.now(),
    direction,
    strength,
    confidence,
    indicators: {
      rsi14,
      ichimoku,
      macd,
      ema: emaReading,
      bollinger,
      volume: volumeReading,
    },
    reasons,
    candleCount: candles.length,
    interval,
  };
}
