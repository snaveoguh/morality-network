/**
 * Periodic market scanner task.
 * Fetches active Polymarket events, runs arb detection, stores results.
 */

import type { PolypooterConfig } from "../config.js";
import { PolymarketClient } from "../polymarket.js";
import { ArbDetector, type ArbOpportunity } from "../arb-detector.js";

// In-memory store (Redis integration later)
let lastScanResults: ArbOpportunity[] = [];
let lastScanAt = 0;
let totalScans = 0;
let totalOpportunitiesFound = 0;

export function getLastScanResults() {
  return { opportunities: lastScanResults, lastScanAt, totalScans, totalOpportunitiesFound };
}

export async function scanMarkets(config: PolypooterConfig): Promise<{
  opportunities: ArbOpportunity[];
  marketsScanned: number;
  durationMs: number;
}> {
  const start = Date.now();
  const client = new PolymarketClient(config);
  const detector = new ArbDetector(client, config);

  console.log("[polypooter] Starting market scan...");

  const opportunities = await detector.scan();

  lastScanResults = opportunities;
  lastScanAt = Date.now();
  totalScans++;
  totalOpportunitiesFound += opportunities.length;

  const durationMs = Date.now() - start;

  if (opportunities.length > 0) {
    console.log(`[polypooter] Found ${opportunities.length} arb opportunities in ${durationMs}ms:`);
    for (const opp of opportunities.slice(0, 5)) {
      console.log(
        `  ${opp.strategy} | ${opp.eventTitle.slice(0, 50)} | cost=$${opp.totalCost.toFixed(4)} | net=${(opp.netProfitPct * 100).toFixed(2)}% | liq=$${opp.liquidity.toFixed(0)}`
      );
    }
  } else {
    console.log(`[polypooter] No arb opportunities found (scanned in ${durationMs}ms)`);
  }

  return {
    opportunities,
    marketsScanned: opportunities.length,
    durationMs,
  };
}
