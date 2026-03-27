/**
 * Reporting task — summarize arb opportunities and performance.
 */

import { getLastScanResults } from "./scan-markets.js";

export interface PolypooterReport {
  totalScans: number;
  totalOpportunitiesFound: number;
  lastScanAt: number;
  currentOpportunities: number;
  topOpportunities: {
    id: string;
    strategy: string;
    event: string;
    netProfitPct: number;
    totalCost: number;
    liquidity: number;
    detectedAt: number;
  }[];
  summary: string;
}

export function generateReport(): PolypooterReport {
  const { opportunities, lastScanAt, totalScans, totalOpportunitiesFound } = getLastScanResults();

  const topOpps = opportunities.slice(0, 10).map((o) => ({
    id: o.id,
    strategy: o.strategy,
    event: o.eventTitle,
    netProfitPct: o.netProfitPct,
    totalCost: o.totalCost,
    liquidity: o.liquidity,
    detectedAt: o.detectedAt,
  }));

  const bestOpp = topOpps[0];
  const summary = bestOpp
    ? `Best opportunity: ${bestOpp.strategy} on "${bestOpp.event.slice(0, 60)}" — ${(bestOpp.netProfitPct * 100).toFixed(2)}% net profit, $${bestOpp.liquidity.toFixed(0)} liquidity`
    : "No arbitrage opportunities currently detected.";

  return {
    totalScans,
    totalOpportunitiesFound,
    lastScanAt,
    currentOpportunities: opportunities.length,
    topOpportunities: topOpps,
    summary,
  };
}
