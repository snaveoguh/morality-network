/**
 * autoresearch.ts — Recursive self-improvement loop for the trading engine.
 *
 * Inspired by deluquant's autoresearch system. Every N closed trades:
 * 1. Generate a learning report from trade history
 * 2. Ask LLM to analyze performance and propose ONE parameter tweak
 * 3. Create an experiment with baseline vs. tweaked params
 * 4. Run with override weights for M trades
 * 5. Evaluate: adopt if outperforms, reject otherwise
 *
 * Uses the existing self-learning.ts infrastructure for performance analysis.
 */

import { randomUUID } from "node:crypto";
import type { Position, SignalWeights, TraderRiskConfig } from "./types";
import { generateLearningReport, type LearningReport } from "./self-learning";
import {
  experimentStore,
  type ExperimentConfig,
  type ExperimentParams,
  type ExperimentMetrics,
} from "./experiment-store";
import { generateTextForTask } from "../ai-provider";
import { positionToJournalEntry } from "./trade-journal";

/* ═══════════════════════════  Config  ═══════════════════════════ */

/** How many closed trades between autoresearch cycles */
const TRADES_PER_CYCLE = parseInt(process.env.AUTORESEARCH_TRADES_PER_CYCLE ?? "50", 10);

/** Minimum trades in an experiment before evaluation */
const MIN_EXPERIMENT_TRADES = parseInt(process.env.AUTORESEARCH_MIN_EXPERIMENT_TRADES ?? "30", 10);

/** Counter for closed trades since last cycle */
let closedTradeCounter = 0;
let lastCycleTradeCount = 0;

/* ═══════════════════════════  Current params extraction  ═══════════════════════════ */

/**
 * Extract current runtime params from env vars / config.
 * Used as the baseline for experiments.
 */
export function extractCurrentParams(risk: TraderRiskConfig): ExperimentParams {
  return {
    signalWeights: {
      technical: parseFloat(process.env.SIGNAL_WEIGHT_TECHNICAL || "0.26"),
      pattern: parseFloat(process.env.SIGNAL_WEIGHT_PATTERN || "0.20"),
      news: parseFloat(process.env.SIGNAL_WEIGHT_NEWS || "0.20"),
      marketData: parseFloat(process.env.SIGNAL_WEIGHT_MARKET_DATA || "0.14"),
      walletFlow: parseFloat(process.env.SIGNAL_WEIGHT_WALLET_FLOW || "0.08"),
      webIntelligence: parseFloat(process.env.SIGNAL_WEIGHT_WEB_INTEL || "0.12"),
    },
    stopLossPct: risk.stopLossPct,
    takeProfitPct: risk.takeProfitPct,
    trailingStopPct: risk.trailingStopPct,
    minSignalConfidence: risk.minSignalConfidence,
    maxLeverage: risk.maxLeverage,
  };
}

/* ═══════════════════════════  Metrics computation  ═══════════════════════════ */

function computeMetrics(positions: Position[]): ExperimentMetrics {
  const closed = positions.filter((p) => p.status === "closed");
  if (closed.length === 0) {
    return {
      trades: 0, wins: 0, losses: 0, winRate: 0,
      profitFactor: 0, sharpeRatio: 0, maxDrawdownPct: 0,
      totalPnlUsd: 0, avgHoldDurationMs: 0,
    };
  }

  const journal = closed
    .map(positionToJournalEntry)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const wins = journal.filter((t) => (t.pnlUsd ?? 0) > 0);
  const losses = journal.filter((t) => (t.pnlUsd ?? 0) < 0);

  const totalWinUsd = wins.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const totalLossUsd = Math.abs(losses.reduce((s, t) => s + (t.pnlUsd ?? 0), 0));

  const profitFactor = totalLossUsd > 0 ? totalWinUsd / totalLossUsd : totalWinUsd > 0 ? Infinity : 0;

  // Simple Sharpe: mean return / std dev of returns
  const returns = journal.map((t) => t.pnlPct ?? 0);
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;

  // Max drawdown
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of journal) {
    equity += t.pnlUsd ?? 0;
    peak = Math.max(peak, equity);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - equity) / peak);
    }
  }

  const totalPnlUsd = journal.reduce((s, t) => s + (t.pnlUsd ?? 0), 0);
  const avgHoldDurationMs =
    journal.reduce((s, t) => s + (t.holdDurationMs ?? 0), 0) / journal.length;

  return {
    trades: journal.length,
    wins: wins.length,
    losses: losses.length,
    winRate: journal.length > 0 ? wins.length / journal.length : 0,
    profitFactor,
    sharpeRatio,
    maxDrawdownPct: Math.round(maxDd * 10000) / 100,
    totalPnlUsd: Math.round(totalPnlUsd * 100) / 100,
    avgHoldDurationMs: Math.round(avgHoldDurationMs),
  };
}

/* ═══════════════════════════  LLM hypothesis generation  ═══════════════════════════ */

async function generateHypothesis(
  report: LearningReport,
  currentParams: ExperimentParams,
): Promise<{ hypothesis: string; tweakedParams: ExperimentParams } | null> {
  const prompt = `You are an autonomous trading system optimizer. Analyze this performance report and suggest ONE specific parameter change to improve performance.

## Current Parameters
Signal weights: technical=${currentParams.signalWeights.technical}, pattern=${currentParams.signalWeights.pattern}, news=${currentParams.signalWeights.news}, marketData=${currentParams.signalWeights.marketData}, walletFlow=${currentParams.signalWeights.walletFlow}, webIntelligence=${currentParams.signalWeights.webIntelligence}
Stop loss: ${(currentParams.stopLossPct * 100).toFixed(1)}%
Take profit: ${(currentParams.takeProfitPct * 100).toFixed(1)}%
Trailing stop: ${(currentParams.trailingStopPct * 100).toFixed(1)}%
Min confidence: ${currentParams.minSignalConfidence}
Max leverage: ${currentParams.maxLeverage}x

## Performance Report (${report.tradeCount} closed trades)
Signal source accuracy:
${report.signalScores.map((s) => `  ${s.source}: ${(s.accuracy * 100).toFixed(1)}% win rate, ${s.trades} trades, avg PnL $${s.avgPnlUsd.toFixed(2)}`).join("\n")}

Current adaptive weights: tech=${report.adaptiveWeights.technical}, pattern=${report.adaptiveWeights.pattern}, news=${report.adaptiveWeights.news}, walletFlow=${report.adaptiveWeights.walletFlow}

Streak: ${report.streaks.recommendation}
Recent drawdown: ${report.streaks.recentDrawdownPct}%

Negative edge markets (Kelly < 0): ${report.negativeEdgeMarkets.length > 0 ? report.negativeEdgeMarkets.join(", ") : "none"}

Per-market Kelly:
${Object.values(report.marketKelly).map((m) => `  ${m.symbol}: ${m.trades} trades, ${(m.winRate * 100).toFixed(0)}% win, Kelly=${m.rawKelly.toFixed(3)}`).join("\n")}

## Instructions
Suggest exactly ONE parameter change. Return JSON only:
{
  "hypothesis": "Brief explanation of why this change should improve performance",
  "param": "the parameter name (e.g., 'signalWeights.technical', 'stopLossPct', 'minSignalConfidence')",
  "newValue": <the new numeric value>
}

Rules:
- Signal weights must sum to ~1.0 (adjust others proportionally if you change one)
- stopLossPct must be between 0.05 and 0.25
- takeProfitPct must be between 0.15 and 0.60
- trailingStopPct must be between 0.03 and 0.15
- minSignalConfidence must be between 0.50 and 0.85
- maxLeverage must be between 1 and 20
- Only change ONE parameter. Be conservative — small tweaks only.`;

  try {
    const result = await generateTextForTask({
      task: "factExtraction",
      user: prompt,
      maxTokens: 500,
    });

    const text = result.text.trim();
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[autoresearch] LLM response didn't contain JSON");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      hypothesis: string;
      param: string;
      newValue: number;
    };

    if (!parsed.hypothesis || !parsed.param || typeof parsed.newValue !== "number") {
      console.warn("[autoresearch] LLM response missing fields");
      return null;
    }

    // Apply the tweak
    const tweakedParams = JSON.parse(JSON.stringify(currentParams)) as ExperimentParams;
    const { param, newValue } = parsed;

    if (param.startsWith("signalWeights.")) {
      const weightKey = param.replace("signalWeights.", "") as keyof ExperimentParams["signalWeights"];
      if (weightKey in tweakedParams.signalWeights) {
        const oldValue = tweakedParams.signalWeights[weightKey];
        const delta = newValue - oldValue;
        tweakedParams.signalWeights[weightKey] = newValue;

        // Redistribute delta proportionally across other weights
        const otherKeys = (Object.keys(tweakedParams.signalWeights) as Array<keyof typeof tweakedParams.signalWeights>)
          .filter((k) => k !== weightKey);
        const otherSum = otherKeys.reduce((s, k) => s + tweakedParams.signalWeights[k], 0);
        if (otherSum > 0) {
          for (const k of otherKeys) {
            tweakedParams.signalWeights[k] -= delta * (tweakedParams.signalWeights[k] / otherSum);
            tweakedParams.signalWeights[k] = Math.max(0.05, tweakedParams.signalWeights[k]);
          }
        }

        // Normalize to sum to 1
        const sum = Object.values(tweakedParams.signalWeights).reduce((s, v) => s + v, 0);
        for (const k of Object.keys(tweakedParams.signalWeights) as Array<keyof typeof tweakedParams.signalWeights>) {
          tweakedParams.signalWeights[k] = Math.round((tweakedParams.signalWeights[k] / sum) * 100) / 100;
        }
      }
    } else if (param === "stopLossPct") {
      tweakedParams.stopLossPct = Math.max(0.05, Math.min(0.25, newValue));
    } else if (param === "takeProfitPct") {
      tweakedParams.takeProfitPct = Math.max(0.15, Math.min(0.60, newValue));
    } else if (param === "trailingStopPct") {
      tweakedParams.trailingStopPct = Math.max(0.03, Math.min(0.15, newValue));
    } else if (param === "minSignalConfidence") {
      tweakedParams.minSignalConfidence = Math.max(0.50, Math.min(0.85, newValue));
    } else if (param === "maxLeverage") {
      tweakedParams.maxLeverage = Math.max(1, Math.min(20, Math.floor(newValue)));
    } else {
      console.warn(`[autoresearch] Unknown parameter: ${param}`);
      return null;
    }

    return { hypothesis: parsed.hypothesis, tweakedParams };
  } catch (err) {
    console.warn("[autoresearch] LLM hypothesis generation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/* ═══════════════════════════  Core cycle  ═══════════════════════════ */

/**
 * Run the autoresearch cycle. Call this from the engine after trades close.
 *
 * Returns the active experiment (if any) so the engine can apply override weights.
 */
export async function runAutoresearchCycle(
  positions: Position[],
  risk: TraderRiskConfig,
): Promise<ExperimentConfig | null> {
  const closedCount = positions.filter((p) => p.status === "closed").length;

  // Check if an experiment is already running
  const active = await experimentStore.getActive();
  if (active) {
    // Update experiment trade count
    const newTrades = closedCount - (active.tradesCompleted + (active.baselineMetrics?.trades ?? 0));
    if (newTrades > active.tradesCompleted) {
      active.tradesCompleted = newTrades;
      await experimentStore.save(active);
    }

    // Evaluate if enough trades
    if (active.tradesCompleted >= active.minTrades) {
      const verdict = evaluateExperiment(active, positions);
      if (verdict !== "continue") {
        console.log(`[autoresearch] Experiment ${active.id}: ${verdict}`);
      }
      return verdict === "adopt" ? active : null;
    }

    return active; // Still running
  }

  // Check if it's time for a new cycle
  if (closedCount - lastCycleTradeCount < TRADES_PER_CYCLE) {
    return null;
  }

  lastCycleTradeCount = closedCount;

  console.log(`[autoresearch] Starting new cycle at ${closedCount} closed trades`);

  const report = generateLearningReport(positions);
  if (report.tradeCount < 10) {
    console.log("[autoresearch] Not enough trades for autoresearch (need 10+)");
    return null;
  }

  const currentParams = extractCurrentParams(risk);
  const result = await generateHypothesis(report, currentParams);
  if (!result) {
    console.log("[autoresearch] No hypothesis generated");
    return null;
  }

  // Create new experiment
  const experiment: ExperimentConfig = {
    id: `exp-${Date.now()}-${randomUUID().slice(0, 8)}`,
    createdAt: Date.now(),
    status: "running",
    baselineParams: currentParams,
    experimentParams: result.tweakedParams,
    hypothesis: result.hypothesis,
    baselineMetrics: computeMetrics(positions),
    experimentMetrics: null,
    minTrades: MIN_EXPERIMENT_TRADES,
    tradesCompleted: 0,
  };

  await experimentStore.save(experiment);
  console.log(
    `[autoresearch] Experiment ${experiment.id} started: ${experiment.hypothesis}`,
  );

  return experiment;
}

/* ═══════════════════════════  Evaluation  ═══════════════════════════ */

/**
 * Evaluate a running experiment.
 * Returns "adopt" if the experiment outperforms, "reject" if not, "continue" if too early.
 */
function evaluateExperiment(
  experiment: ExperimentConfig,
  positions: Position[],
): "adopt" | "reject" | "continue" {
  if (experiment.tradesCompleted < experiment.minTrades) {
    return "continue";
  }

  // Compute metrics for trades during the experiment period
  const experimentPositions = positions.filter(
    (p) => p.status === "closed" && p.closedAt && p.closedAt >= experiment.createdAt,
  );
  const experimentMetrics = computeMetrics(experimentPositions);
  experiment.experimentMetrics = experimentMetrics;

  const baseline = experiment.baselineMetrics;
  if (!baseline || baseline.trades === 0) {
    // No baseline to compare — adopt if profitable
    if (experimentMetrics.totalPnlUsd > 0) {
      experiment.status = "adopted";
      experiment.adoptedAt = Date.now();
      experimentStore.save(experiment);
      return "adopt";
    }
    experiment.status = "rejected";
    experiment.rejectedAt = Date.now();
    experiment.rejectionReason = "No baseline and experiment not profitable";
    experimentStore.save(experiment);
    return "reject";
  }

  // Adoption criteria:
  // 1. Profit factor improved by >10% OR Sharpe improved by >0.2
  // 2. Max drawdown didn't increase by >5 percentage points
  const pfImproved = baseline.profitFactor > 0
    ? (experimentMetrics.profitFactor - baseline.profitFactor) / baseline.profitFactor > 0.10
    : experimentMetrics.profitFactor > 1;
  const sharpeImproved = experimentMetrics.sharpeRatio - baseline.sharpeRatio > 0.2;
  const ddAcceptable = experimentMetrics.maxDrawdownPct - baseline.maxDrawdownPct < 5;

  if ((pfImproved || sharpeImproved) && ddAcceptable) {
    experiment.status = "adopted";
    experiment.adoptedAt = Date.now();
    experimentStore.save(experiment);
    console.log(
      `[autoresearch] ADOPTED ${experiment.id}: PF ${baseline.profitFactor.toFixed(2)} → ${experimentMetrics.profitFactor.toFixed(2)}, ` +
      `Sharpe ${baseline.sharpeRatio.toFixed(2)} → ${experimentMetrics.sharpeRatio.toFixed(2)}`,
    );
    return "adopt";
  }

  experiment.status = "rejected";
  experiment.rejectedAt = Date.now();
  experiment.rejectionReason = !ddAcceptable
    ? `Drawdown increased too much: ${baseline.maxDrawdownPct.toFixed(1)}% → ${experimentMetrics.maxDrawdownPct.toFixed(1)}%`
    : `No improvement: PF ${baseline.profitFactor.toFixed(2)} → ${experimentMetrics.profitFactor.toFixed(2)}, Sharpe ${baseline.sharpeRatio.toFixed(2)} → ${experimentMetrics.sharpeRatio.toFixed(2)}`;
  experimentStore.save(experiment);
  console.log(`[autoresearch] REJECTED ${experiment.id}: ${experiment.rejectionReason}`);
  return "reject";
}

/* ═══════════════════════════  Override weights helper  ═══════════════════════════ */

/**
 * Get the active experiment's signal weight overrides (if any).
 * The engine calls this to pass to computeCompositeSignal().
 */
export async function getExperimentOverrideWeights(): Promise<SignalWeights | undefined> {
  const active = await experimentStore.getActive();
  if (!active) return undefined;

  const w = active.experimentParams.signalWeights;
  return {
    technical: w.technical,
    pattern: w.pattern,
    news: w.news,
    marketData: w.marketData,
    walletFlow: w.walletFlow,
    webIntelligence: w.webIntelligence,
  };
}

/**
 * Check if autoresearch should trigger.
 * Call from engine after each cycle that has exits.
 */
export function shouldTriggerAutoresearch(closedTradeCount: number): boolean {
  return closedTradeCount - lastCycleTradeCount >= TRADES_PER_CYCLE;
}

/** Get the current experiment count threshold */
export function getTradesPerCycle(): number {
  return TRADES_PER_CYCLE;
}
