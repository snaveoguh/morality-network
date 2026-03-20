/**
 * kelly.ts — Kelly Criterion position sizing + leverage derivation.
 *
 * The Kelly Criterion determines the mathematically optimal fraction of
 * capital to risk based on your actual edge:
 *
 *   f* = (bp − q) / b
 *
 * where:
 *   f* = optimal fraction of bankroll to risk
 *   b  = win/loss ratio (avg win $ / avg loss $)
 *   p  = probability of winning
 *   q  = 1 − p
 *
 * Phases:
 *   Cold  (<10 trades)  → quarter-Kelly  (conservative, estimated edge)
 *   Warm  (10-99 trades) → half-Kelly     (hedge-fund standard)
 *   Hot   (100+ trades)  → two-thirds-Kelly (proven edge)
 *
 * Safety: Kelly fraction never exceeds 25%. Negative Kelly = no trade.
 */

import type { TradeJournalEntry, TraderExecutionConfig } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface KellyResult {
  /** raw Kelly fraction before safety multiplier */
  rawKelly: number;
  /** phase multiplier applied (0.25, 0.5, 0.667) */
  phaseMultiplier: number;
  /** final Kelly fraction after multiplier + caps (0-0.25) */
  fraction: number;
  /** phase label */
  phase: "cold" | "warm" | "hot";
  /** total trade count used */
  tradeCount: number;
  /** win probability used */
  winProbability: number;
  /** win/loss ratio used */
  winLossRatio: number;
  /** risk budget in USD */
  riskBudgetUsd: number;
  /** suggested position notional in USD */
  positionNotionalUsd: number;
  /** suggested leverage */
  leverage: number;
  /** skip this trade — negative edge or too weak */
  skip: boolean;
  /** reason for skip if applicable */
  skipReason?: string;
}

/* ═══════════════════  Core Kelly Computation  ═══════════════════ */

/**
 * Compute raw Kelly fraction: f* = (bp - q) / b
 */
function rawKellyFraction(winProb: number, winLossRatio: number): number {
  const p = Math.max(0, Math.min(1, winProb));
  const q = 1 - p;
  const b = Math.max(0.001, winLossRatio); // avoid division by zero
  return (b * p - q) / b;
}

/**
 * Calculate win probability and win/loss ratio from trade history.
 * Optionally filter by symbol for per-market Kelly.
 */
function statsFromJournal(
  trades: TradeJournalEntry[],
  symbol?: string,
): { winProb: number; winLossRatio: number; count: number } {
  const closed = trades.filter(
    (t) => t.pnlUsd !== undefined && (!symbol || t.symbol === symbol),
  );

  if (closed.length === 0) {
    return { winProb: 0.5, winLossRatio: 1.5, count: 0 };
  }

  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnlUsd ?? 0) < 0);

  const winProb = wins.length / closed.length;

  const avgWin =
    wins.length > 0
      ? wins.reduce((sum, t) => sum + Math.abs(t.pnlUsd ?? 0), 0) / wins.length
      : 1;
  const avgLoss =
    losses.length > 0
      ? losses.reduce((sum, t) => sum + Math.abs(t.pnlUsd ?? 0), 0) / losses.length
      : 1;

  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1.5;

  return { winProb, winLossRatio, count: closed.length };
}

/**
 * Determine the Kelly phase and multiplier based on trade count.
 */
function kellyPhase(tradeCount: number): { phase: "cold" | "warm" | "hot"; multiplier: number } {
  if (tradeCount >= 100) return { phase: "hot", multiplier: 2 / 3 };
  if (tradeCount >= 10) return { phase: "warm", multiplier: 0.5 };
  return { phase: "cold", multiplier: 0.25 };
}

/**
 * Check recent drawdown. If > threshold, force quarter-Kelly.
 */
function recentDrawdownPct(trades: TradeJournalEntry[], windowSize: number = 20): number {
  const recent = trades
    .filter((t) => t.pnlUsd !== undefined)
    .slice(-windowSize);

  if (recent.length < 3) return 0;

  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;

  for (const t of recent) {
    equity += t.pnlUsd ?? 0;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  return maxDrawdown;
}

/* ═══════════════════  Main export  ═══════════════════ */

const MAX_KELLY_FRACTION = 0.25;
const DRAWDOWN_OVERRIDE_THRESHOLD = 0.15;

export function computeKelly(args: {
  config: TraderExecutionConfig;
  accountValueUsd: number;
  compositeConfidence: number;
  journal: TradeJournalEntry[];
  symbol?: string;
  stopDistancePct: number;
}): KellyResult {
  const { config, accountValueUsd, compositeConfidence, journal, symbol, stopDistancePct } = args;

  // Get historical stats (per-market if 100+ trades, otherwise global)
  const stats = statsFromJournal(journal, journal.length >= 100 ? symbol : undefined);
  const { phase, multiplier: phaseMultiplier } = kellyPhase(stats.count);

  // In cold start, blend historical win prob with composite confidence
  let winProb: number;
  let winLossRatio: number;

  if (stats.count === 0) {
    // No history at all — use composite confidence as win probability estimate
    winProb = compositeConfidence;
    winLossRatio = 1.5; // conservative assumption
  } else if (stats.count < 10) {
    // Blend: 60% confidence, 40% historical (not enough data to trust fully)
    winProb = compositeConfidence * 0.6 + stats.winProb * 0.4;
    winLossRatio = stats.winLossRatio;
  } else {
    // Warm/hot: 30% confidence, 70% historical
    winProb = compositeConfidence * 0.3 + stats.winProb * 0.7;
    winLossRatio = stats.winLossRatio;
  }

  const rawKelly = rawKellyFraction(winProb, winLossRatio);

  // Negative Kelly = no edge → skip trade
  if (rawKelly <= 0) {
    return {
      rawKelly,
      phaseMultiplier,
      fraction: 0,
      phase,
      tradeCount: stats.count,
      winProbability: winProb,
      winLossRatio,
      riskBudgetUsd: 0,
      positionNotionalUsd: 0,
      leverage: 0,
      skip: true,
      skipReason: `Negative Kelly (${rawKelly.toFixed(4)}) — no edge on ${symbol ?? "market"}`,
    };
  }

  // Apply phase multiplier
  let effectiveMultiplier = phaseMultiplier;

  // Drawdown override: force quarter-Kelly if recent drawdown > 15%
  const drawdown = recentDrawdownPct(journal, 20);
  if (drawdown > DRAWDOWN_OVERRIDE_THRESHOLD) {
    effectiveMultiplier = Math.min(effectiveMultiplier, 0.25);
  }

  // Final Kelly fraction with hard cap
  const fraction = Math.min(MAX_KELLY_FRACTION, rawKelly * effectiveMultiplier);

  // Convert Kelly fraction to position size
  const riskBudgetUsd = accountValueUsd * fraction;
  const stopDist = Math.max(0.005, stopDistancePct); // min 0.5% stop distance
  const positionNotionalUsd = riskBudgetUsd / stopDist;

  // Derive leverage — use at least the default leverage (never go below it)
  const maxLeverage = config.risk.maxLeverage;
  const minLeverage = config.hyperliquid?.defaultLeverage ?? 10;
  const kellyLeverage = Math.floor(positionNotionalUsd / accountValueUsd);
  const leverage = Math.min(
    Math.max(minLeverage, kellyLeverage),
    maxLeverage,
  );

  // Cap position to max allowed
  const cappedNotional = Math.min(positionNotionalUsd, config.risk.maxPositionUsd);

  return {
    rawKelly,
    phaseMultiplier: effectiveMultiplier,
    fraction,
    phase,
    tradeCount: stats.count,
    winProbability: winProb,
    winLossRatio,
    riskBudgetUsd,
    positionNotionalUsd: cappedNotional,
    leverage,
    skip: false,
  };
}

/**
 * Consecutive losses count (for circuit breaker).
 */
export function consecutiveLosses(journal: TradeJournalEntry[]): number {
  const closed = journal.filter((t) => t.pnlUsd !== undefined);
  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if ((closed[i].pnlUsd ?? 0) < 0) streak++;
    else break;
  }
  return streak;
}
