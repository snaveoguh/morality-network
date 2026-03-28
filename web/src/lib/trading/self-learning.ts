/**
 * self-learning.ts — Adaptive strategy tuning from trade history.
 *
 * Analyzes closed trades to:
 * 1. Compute per-market Kelly parameters (win rate + win/loss ratio)
 * 2. Score signal source accuracy (technical, pattern, news)
 * 3. Suggest dynamic signal weight adjustments
 * 4. Detect losing streaks and recommend caution
 */

import type { Position } from "./types";
import type { TradeJournalEntry } from "./types";
import { positionToJournalEntry } from "./trade-journal";

/* ── Per-market Kelly parameters ── */

export interface MarketKellyParams {
  symbol: string;
  trades: number;
  winRate: number;       // p
  winLossRatio: number;  // b (avg win / avg loss)
  rawKelly: number;      // (bp - q) / b
  suggestedMultiplier: number; // quarter/half/two-thirds based on trade count
  effectiveKelly: number;      // rawKelly * suggestedMultiplier, capped at 0.25
}

export function computeMarketKelly(journal: TradeJournalEntry[]): Record<string, MarketKellyParams> {
  const bySymbol = new Map<string, TradeJournalEntry[]>();
  for (const t of journal) {
    const existing = bySymbol.get(t.symbol) ?? [];
    existing.push(t);
    bySymbol.set(t.symbol, existing);
  }

  const result: Record<string, MarketKellyParams> = {};

  for (const [symbol, trades] of bySymbol) {
    const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnlUsd ?? 0) < 0);

    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + Math.abs(t.pnlUsd ?? 0), 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((s, t) => s + Math.abs(t.pnlUsd ?? 0), 0) / losses.length
      : 1; // avoid div by zero

    const b = avgLoss > 0 ? avgWin / avgLoss : 1.5; // win/loss ratio
    const p = winRate;
    const q = 1 - p;
    const rawKelly = b > 0 ? (b * p - q) / b : 0;

    // Multiplier based on sample size
    let suggestedMultiplier: number;
    if (trades.length >= 100) {
      suggestedMultiplier = 0.667; // two-thirds Kelly
    } else if (trades.length >= 10) {
      suggestedMultiplier = 0.5; // half Kelly
    } else {
      suggestedMultiplier = 0.25; // quarter Kelly
    }

    const effectiveKelly = Math.min(Math.max(rawKelly * suggestedMultiplier, 0), 0.25);

    result[symbol] = {
      symbol,
      trades: trades.length,
      winRate,
      winLossRatio: b,
      rawKelly,
      suggestedMultiplier,
      effectiveKelly,
    };
  }

  return result;
}

/* ── Signal source accuracy ── */

export interface SignalSourceScore {
  source: string;
  trades: number;
  wins: number;
  losses: number;
  accuracy: number;
  avgPnlUsd: number;
  suggestedWeight: number;
}

export function scoreSignalSources(journal: TradeJournalEntry[]): SignalSourceScore[] {
  const sources = ["technical", "pattern", "news", "wallet-flow", "composite"];
  const bySource = new Map<string, TradeJournalEntry[]>();

  for (const t of journal) {
    const src = t.signalSource || "composite";
    const existing = bySource.get(src) ?? [];
    existing.push(t);
    bySource.set(src, existing);
  }

  const scores: SignalSourceScore[] = [];
  let totalAccuracy = 0;
  let sourcesWithData = 0;

  for (const source of sources) {
    const trades = bySource.get(source) ?? [];
    if (trades.length === 0) {
      scores.push({
        source,
        trades: 0,
        wins: 0,
        losses: 0,
        accuracy: 0,
        avgPnlUsd: 0,
        suggestedWeight: source === "technical" ? 0.4 : source === "pattern" ? 0.3 : 0.3,
      });
      continue;
    }

    const wins = trades.filter((t) => (t.pnlUsd ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnlUsd ?? 0) < 0);
    const accuracy = trades.length > 0 ? wins.length / trades.length : 0;
    const avgPnlUsd = trades.reduce((s, t) => s + (t.pnlUsd ?? 0), 0) / trades.length;

    totalAccuracy += accuracy;
    sourcesWithData++;

    scores.push({
      source,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      accuracy,
      avgPnlUsd,
      suggestedWeight: accuracy, // will normalize below
    });
  }

  // Normalize weights to sum to 1.0 (only for sources with data)
  if (sourcesWithData > 0 && totalAccuracy > 0) {
    for (const s of scores) {
      if (s.trades > 0) {
        s.suggestedWeight = s.accuracy / totalAccuracy;
      }
    }
  }

  return scores;
}

/* ── Adaptive signal weights ── */

export interface AdaptiveWeights {
  technical: number;
  pattern: number;
  news: number;
  walletFlow: number;
  reason: string;
}

/**
 * Compute suggested signal weights based on trade history.
 * Falls back to defaults (0.4/0.3/0.3) if insufficient data.
 */
export function computeAdaptiveWeights(journal: TradeJournalEntry[]): AdaptiveWeights {
  const defaults: AdaptiveWeights = {
    technical: 0.35,
    pattern: 0.25,
    news: 0.25,
    walletFlow: 0.15,
    reason: "default weights (insufficient trade history)",
  };

  // Need at least 10 trades to start adapting
  if (journal.length < 10) return defaults;

  const sourceScores = scoreSignalSources(journal);
  const techScore = sourceScores.find((s) => s.source === "technical");
  const patternScore = sourceScores.find((s) => s.source === "pattern");
  const newsScore = sourceScores.find((s) => s.source === "news");
  const wfScore = sourceScores.find((s) => s.source === "wallet-flow");

  // If no source has enough data, keep defaults
  const hasEnoughData = [techScore, patternScore, newsScore, wfScore].some(
    (s) => s && s.trades >= 5,
  );
  if (!hasEnoughData) return defaults;

  // Blend: 70% data-driven + 30% prior (prevents wild swings)
  const priorTech = 0.35, priorPattern = 0.25, priorNews = 0.25, priorWf = 0.15;
  const dataTech = techScore?.suggestedWeight ?? 0.25;
  const dataPattern = patternScore?.suggestedWeight ?? 0.25;
  const dataNews = newsScore?.suggestedWeight ?? 0.25;
  const dataWf = wfScore?.suggestedWeight ?? 0.25;

  let technical = 0.7 * dataTech + 0.3 * priorTech;
  let pattern = 0.7 * dataPattern + 0.3 * priorPattern;
  let news = 0.7 * dataNews + 0.3 * priorNews;
  let walletFlow = 0.7 * dataWf + 0.3 * priorWf;

  // Normalize
  const sum = technical + pattern + news + walletFlow;
  technical /= sum;
  pattern /= sum;
  news /= sum;
  walletFlow /= sum;

  // Floor: no source below 5%
  technical = Math.max(technical, 0.05);
  pattern = Math.max(pattern, 0.05);
  news = Math.max(news, 0.05);
  walletFlow = Math.max(walletFlow, 0.05);
  const sum2 = technical + pattern + news + walletFlow;
  technical /= sum2;
  pattern /= sum2;
  news /= sum2;
  walletFlow /= sum2;

  return {
    technical: Math.round(technical * 100) / 100,
    pattern: Math.round(pattern * 100) / 100,
    news: Math.round(news * 100) / 100,
    walletFlow: Math.round(walletFlow * 100) / 100,
    reason: `adaptive weights from ${journal.length} trades (tech: ${((techScore?.accuracy ?? 0) * 100).toFixed(0)}%, pattern: ${((patternScore?.accuracy ?? 0) * 100).toFixed(0)}%, news: ${((newsScore?.accuracy ?? 0) * 100).toFixed(0)}%, wf: ${((wfScore?.accuracy ?? 0) * 100).toFixed(0)}%)`,
  };
}

/* ── Streak detection ── */

export interface StreakAnalysis {
  currentStreak: number; // positive = wins, negative = losses
  maxWinStreak: number;
  maxLossStreak: number;
  isOnTilt: boolean;     // 3+ consecutive losses
  recentDrawdownPct: number; // drawdown in last 10 trades
  recommendation: string;
}

export function analyzeStreaks(journal: TradeJournalEntry[]): StreakAnalysis {
  if (journal.length === 0) {
    return {
      currentStreak: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      isOnTilt: false,
      recentDrawdownPct: 0,
      recommendation: "No trades yet. System ready.",
    };
  }

  // Sort by exit time
  const sorted = [...journal].sort(
    (a, b) => (a.exitTimestamp ?? 0) - (b.exitTimestamp ?? 0),
  );

  let currentStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let winStreak = 0;
  let lossStreak = 0;

  for (const t of sorted) {
    if ((t.pnlUsd ?? 0) > 0) {
      winStreak++;
      lossStreak = 0;
      currentStreak = winStreak;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if ((t.pnlUsd ?? 0) < 0) {
      lossStreak++;
      winStreak = 0;
      currentStreak = -lossStreak;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }

  // Recent drawdown (last 10 trades)
  const recent = sorted.slice(-10);
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of recent) {
    equity += t.pnlUsd ?? 0;
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - equity) / peak);
    }
  }

  const isOnTilt = currentStreak <= -3;

  let recommendation: string;
  if (isOnTilt) {
    recommendation = "TILT: 3+ consecutive losses. Force quarter-Kelly, reduce position sizes.";
  } else if (maxDd > 0.15) {
    recommendation = "CAUTION: >15% recent drawdown. Use quarter-Kelly until recovery.";
  } else if (currentStreak >= 5) {
    recommendation = "HOT STREAK: Consider taking some profit and tightening stops.";
  } else {
    recommendation = "Normal operation. Continue current strategy.";
  }

  return {
    currentStreak,
    maxWinStreak,
    maxLossStreak,
    isOnTilt,
    recentDrawdownPct: Math.round(maxDd * 10000) / 100, // e.g., 15.23
    recommendation,
  };
}

/* ── Full learning report ── */

export interface LearningReport {
  tradeCount: number;
  marketKelly: Record<string, MarketKellyParams>;
  signalScores: SignalSourceScore[];
  adaptiveWeights: AdaptiveWeights;
  streaks: StreakAnalysis;
  negativeEdgeMarkets: string[]; // markets where Kelly < 0 = no edge
}

export function generateLearningReport(positions: Position[]): LearningReport {
  const journal = positions
    .filter((p) => p.status === "closed")
    .map(positionToJournalEntry)
    .filter((e): e is TradeJournalEntry => e !== null);

  const marketKelly = computeMarketKelly(journal);
  const signalScores = scoreSignalSources(journal);
  const adaptiveWeights = computeAdaptiveWeights(journal);
  const streaks = analyzeStreaks(journal);

  const negativeEdgeMarkets = Object.entries(marketKelly)
    .filter(([, params]) => params.rawKelly < 0)
    .map(([symbol]) => symbol);

  return {
    tradeCount: journal.length,
    marketKelly,
    signalScores,
    adaptiveWeights,
    streaks,
    negativeEdgeMarkets,
  };
}
