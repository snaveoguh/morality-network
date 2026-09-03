/**
 * trade-journal.ts — Trade history recording + performance metrics.
 *
 * Converts closed Position records into TradeJournalEntry objects and
 * computes aggregate performance stats: win rate, profit factor,
 * Sharpe ratio, max drawdown, average hold time, PnL by symbol.
 */

import type { Position, TradeJournalEntry } from "./types";

/* ═══════════════════  Position → Journal  ═══════════════════ */

export function positionToJournalEntry(p: Position): TradeJournalEntry | null {
  if (p.status !== "closed" || p.exitPriceUsd === undefined) return null;

  const direction = (p.direction ?? "long") as "long" | "short";
  const entryPrice = p.entryPriceUsd;
  const exitPrice = p.exitPriceUsd;
  const notionalUsd = p.entryNotionalUsd;

  const leverage = p.leverage ?? 1;
  const priceMove =
    entryPrice > 0
      ? direction === "short"
        ? (entryPrice - exitPrice) / entryPrice
        : (exitPrice - entryPrice) / entryPrice
      : 0;

  // Cash PnL: notional is already the full position size, so no leverage
  // multiplier (it used to be applied here too, inflating every journal
  // entry — and therefore Kelly stats and the per-symbol gate — by the
  // leverage factor). Prefer HL's own closed figure when the sync captured it.
  const hlPnl = p.hlUnrealizedPnlUsd;
  const pnlUsd =
    typeof hlPnl === "number" && Number.isFinite(hlPnl)
      ? hlPnl
      : notionalUsd * priceMove;
  // Return on margin (what the trader experiences), kept leverage-scaled.
  const pnlPct = priceMove * leverage;

  return {
    id: p.id,
    symbol: p.marketSymbol ?? "UNKNOWN",
    direction,
    entryTimestamp: p.openedAt,
    exitTimestamp: p.closedAt,
    entryPrice,
    exitPrice,
    leverage: p.leverage ?? 1,
    notionalUsd,
    pnlUsd,
    pnlPct,
    holdDurationMs:
      p.closedAt && p.openedAt ? p.closedAt - p.openedAt : undefined,
    signalSource: p.signalSource ?? "news",
    compositeConfidence: p.signalConfidence ?? 0.5,
    kellyFraction: p.kellyFraction ?? 0.1,
    exitReason: p.exitReason,
    entryRationale: p.entryRationale,
    exitRationale: p.exitRationale,
    moralScore: p.moralScore,
    moralJustification: p.moralJustification,
  };
}

export function positionsToJournal(positions: Position[]): TradeJournalEntry[] {
  return positions
    .map(positionToJournalEntry)
    .filter((e): e is TradeJournalEntry => e !== null)
    .sort((a, b) => (a.exitTimestamp ?? 0) - (b.exitTimestamp ?? 0));
}

/* ═══════════════════  Performance Metrics  ═══════════════════ */

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  profitFactor: number;
  /** annualized Sharpe ratio (risk-free = 0) */
  sharpeRatio: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  avgHoldDurationMs: number;
  avgLeverage: number;
  /** PnL breakdown by symbol */
  bySymbol: Record<string, SymbolMetrics>;
  /** best single trade */
  bestTradeUsd: number;
  /** worst single trade */
  worstTradeUsd: number;
}

export interface SymbolMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  avgPnlUsd: number;
}

export function computePerformanceMetrics(
  journal: TradeJournalEntry[],
): PerformanceMetrics {
  const closed = journal.filter((t) => t.pnlUsd !== undefined);

  if (closed.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnlUsd: 0,
      avgPnlUsd: 0,
      grossProfitUsd: 0,
      grossLossUsd: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdownPct: 0,
      maxDrawdownUsd: 0,
      avgHoldDurationMs: 0,
      avgLeverage: 0,
      bySymbol: {},
      bestTradeUsd: 0,
      worstTradeUsd: 0,
    };
  }

  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnlUsd ?? 0) < 0);

  const totalPnlUsd = closed.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const grossProfitUsd = wins.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const grossLossUsd = Math.abs(
    losses.reduce((s, t) => s + (t.pnlUsd ?? 0), 0),
  );

  // Sharpe: mean(returns) / std(returns) * sqrt(annualization factor)
  const returns = closed.map((t) => t.pnlPct ?? 0);
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const stdReturn = Math.sqrt(variance);
  // Assume ~6 trades/day (every 10 min for 1 hour = 6, rough estimate)
  const annualizationFactor = Math.sqrt(365 * 6);
  const sharpeRatio =
    stdReturn > 0 ? (meanReturn / stdReturn) * annualizationFactor : 0;

  // Max drawdown
  let peak = 0;
  let equity = 0;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;
  for (const t of closed) {
    equity += t.pnlUsd ?? 0;
    peak = Math.max(peak, equity);
    const ddUsd = peak - equity;
    const ddPct = peak > 0 ? ddUsd / peak : 0;
    maxDrawdownUsd = Math.max(maxDrawdownUsd, ddUsd);
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
  }

  // Average hold duration
  const holdDurations = closed
    .map((t) => t.holdDurationMs)
    .filter((d): d is number => d !== undefined && d > 0);
  const avgHoldDurationMs =
    holdDurations.length > 0
      ? holdDurations.reduce((s, d) => s + d, 0) / holdDurations.length
      : 0;

  const avgLeverage =
    closed.reduce((s, t) => s + t.leverage, 0) / closed.length;

  // By symbol
  const bySymbol: Record<string, SymbolMetrics> = {};
  for (const t of closed) {
    const sym = t.symbol;
    if (!bySymbol[sym]) {
      bySymbol[sym] = {
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnlUsd: 0,
        avgPnlUsd: 0,
      };
    }
    const m = bySymbol[sym];
    m.trades++;
    if ((t.pnlUsd ?? 0) > 0) m.wins++;
    else if ((t.pnlUsd ?? 0) < 0) m.losses++;
    m.totalPnlUsd += t.pnlUsd ?? 0;
  }
  for (const m of Object.values(bySymbol)) {
    m.winRate = m.trades > 0 ? m.wins / m.trades : 0;
    m.avgPnlUsd = m.trades > 0 ? m.totalPnlUsd / m.trades : 0;
  }

  const pnls = closed.map((t) => t.pnlUsd ?? 0);

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? wins.length / closed.length : 0,
    totalPnlUsd,
    avgPnlUsd: totalPnlUsd / closed.length,
    grossProfitUsd,
    grossLossUsd,
    profitFactor: grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : 0,
    sharpeRatio,
    maxDrawdownPct,
    maxDrawdownUsd,
    avgHoldDurationMs,
    avgLeverage,
    bySymbol,
    bestTradeUsd: Math.max(...pnls, 0),
    worstTradeUsd: Math.min(...pnls, 0),
  };
}

/* ═══════════════════  Per-Symbol Performance Gate  ═══════════════════ */

export interface SymbolGateOptions {
  /** Judge each symbol on its last N closed trades */
  lookbackTrades?: number;
  /** Need at least this many closed trades before gating */
  minTrades?: number;
  /** Gate when net PnL over the window is at or below −this */
  netLossUsd?: number;
  /** Or when the trailing consecutive-loss streak reaches this */
  lossStreak?: number;
  /** Stand down this long after the symbol's most recent close */
  cooldownMs?: number;
}

const SYMBOL_GATE_DEFAULTS = {
  lookbackTrades: 5,
  minTrades: 3,
  netLossUsd: 2,
  lossStreak: 3,
  cooldownMs: 48 * 3_600_000,
};

/**
 * Symbols the trader should stand down from because they keep losing.
 *
 * A symbol is gated when its recent window is net negative (or ends in a
 * loss streak) AND its latest close is still inside the cooldown. Once the
 * cooldown lapses the symbol gets one probe trade — if that loses too, the
 * window stays negative and the gate re-arms from the new close.
 *
 * Returns a map of UPPERCASED symbol → human-readable gate reason.
 */
export function gatedSymbols(
  journal: TradeJournalEntry[],
  options: SymbolGateOptions = {},
  now: number = Date.now(),
): Map<string, string> {
  const cfg = { ...SYMBOL_GATE_DEFAULTS };
  for (const key of Object.keys(SYMBOL_GATE_DEFAULTS) as (keyof typeof SYMBOL_GATE_DEFAULTS)[]) {
    const value = options[key];
    if (typeof value === "number" && Number.isFinite(value)) cfg[key] = value;
  }

  const bySymbol = new Map<string, TradeJournalEntry[]>();
  for (const entry of journal) {
    const symbol = entry.symbol?.toUpperCase();
    if (!symbol || entry.exitTimestamp === undefined) continue;
    const list = bySymbol.get(symbol);
    if (list) list.push(entry);
    else bySymbol.set(symbol, [entry]);
  }

  const gated = new Map<string, string>();
  for (const [symbol, entries] of bySymbol) {
    entries.sort((a, b) => (a.exitTimestamp ?? 0) - (b.exitTimestamp ?? 0));
    const window = entries.slice(-cfg.lookbackTrades);
    if (window.length < cfg.minTrades) continue;

    const lastExit = window[window.length - 1].exitTimestamp ?? 0;
    if (now - lastExit >= cfg.cooldownMs) continue; // cooldown served — probe allowed

    const netPnl = window.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
    let streak = 0;
    for (let i = window.length - 1; i >= 0; i--) {
      if ((window[i].pnlUsd ?? 0) < 0) streak++;
      else break;
    }

    const remainingH = ((cfg.cooldownMs - (now - lastExit)) / 3_600_000).toFixed(1);
    if (netPnl <= -cfg.netLossUsd) {
      gated.set(symbol, `net ${netPnl.toFixed(2)} USD over last ${window.length} trades, ${remainingH}h cooldown left`);
    } else if (streak >= cfg.lossStreak) {
      gated.set(symbol, `${streak} consecutive losses, ${remainingH}h cooldown left`);
    }
  }
  return gated;
}
