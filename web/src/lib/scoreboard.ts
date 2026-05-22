import "server-only";

import { fetchAIUsageSummary } from "./server/ai-telemetry";
import { fetchPersistedTraderState } from "./server/runtime-backend";
import { getTraderPerformanceByRunner } from "./trading/engine";
import { isWorkerTraderRuntime } from "./runtime-mode";
import type { TraderPerformanceReport } from "./trading/types";

/**
 * The scoreboard for the North Star: does the platform fund its own inference?
 *
 * success = realized trading revenue >= LLM inference cost, over a window.
 * The inference side comes from the AI usage meter (ai-provider.ts -> indexer);
 * the revenue side is realized PnL on positions CLOSED inside the same window,
 * so the two are directly comparable.
 */
export interface InferenceFundingStatus {
  windowHours: number;
  since: number;
  until: number;
  inferenceCostUsd: number;
  /** Realized PnL summed over positions closed within the window. */
  tradingRevenueUsd: number;
  /** tradingRevenueUsd - inferenceCostUsd. */
  netUsd: number;
  /** revenue / cost * 100. null when no inference cost was recorded. */
  fundingPct: number | null;
  selfFunding: boolean;
  closedTradeCount: number;
}

/** All trader performance reports (primary + parallel runners), both runtimes. */
async function getAllPerformanceReports(): Promise<TraderPerformanceReport[]> {
  if (isWorkerTraderRuntime()) {
    const state = await fetchPersistedTraderState();
    const reports: TraderPerformanceReport[] = [];
    if (state.performance) reports.push(state.performance);
    for (const runner of state.parallelPerformance) reports.push(runner.performance);
    return reports;
  }
  const byRunner = await getTraderPerformanceByRunner();
  return [byRunner.primary, ...byRunner.parallel.map((runner) => runner.performance)];
}

export async function getInferenceFundingStatus(
  options: { hours?: number } = {},
): Promise<InferenceFundingStatus> {
  const windowHours = Math.max(1, Math.floor(options.hours ?? 168));
  const until = Date.now();
  const since = until - windowHours * 3_600_000;

  // ── inference cost (the meter handles its own window) ──
  const usage = await fetchAIUsageSummary({ hours: windowHours }).catch(() => null);
  const inferenceCostUsd = Math.max(0, usage?.totals.estimatedCostUsd ?? 0);

  // ── trading revenue: realized PnL on positions closed inside the window ──
  let tradingRevenueUsd = 0;
  let closedTradeCount = 0;
  try {
    const reports = await getAllPerformanceReports();
    for (const report of reports) {
      for (const metric of report.closed ?? []) {
        const closedAt = metric.position?.closedAt;
        if (typeof closedAt !== "number" || closedAt < since || closedAt > until) continue;
        const pnl = metric.realizedPnlUsd;
        if (typeof pnl === "number" && Number.isFinite(pnl)) {
          tradingRevenueUsd += pnl;
          closedTradeCount += 1;
        }
      }
    }
  } catch {
    // If trader state is unreachable, report 0 revenue rather than fake a number.
  }

  const netUsd = tradingRevenueUsd - inferenceCostUsd;
  const fundingPct =
    inferenceCostUsd > 0 ? (tradingRevenueUsd / inferenceCostUsd) * 100 : null;

  return {
    windowHours,
    since,
    until,
    inferenceCostUsd,
    tradingRevenueUsd,
    netUsd,
    fundingPct,
    selfFunding: netUsd >= 0,
    closedTradeCount,
  };
}
