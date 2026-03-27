/**
 * Arbitrage detection engine for Polymarket.
 *
 * Strategy 1: Completeness Arb
 *   Binary market: YES + NO should = $1.00.
 *   If bestAsk(YES) + bestAsk(NO) < 1.00 - fees, buy both → guaranteed profit.
 *
 * Strategy 2: Multi-Outcome Arb
 *   Events with >2 markets (e.g. "Who wins the election?" with 5 candidates).
 *   If sum of cheapest YES across all outcomes < $1.00 - fees, buy all → one wins → profit.
 *
 * Strategy 3: Stale Odds Detection (informational)
 *   Flag markets where implied probability diverges significantly from
 *   recent price momentum (potential mispricing for manual review).
 */

import type { PolymarketClient, PolymarketEvent, PolymarketMarket } from "./polymarket.js";
import type { PolypooterConfig } from "./config.js";

// ── Types ──

export interface ArbOpportunity {
  id: string;
  strategy: "completeness" | "multi-outcome" | "stale-odds";
  eventTitle: string;
  markets: ArbMarketLeg[];
  totalCost: number;       // Total to buy all legs
  guaranteedReturn: number; // $1.00 per share on resolution
  spreadPct: number;        // (return - cost) / cost
  netProfitPct: number;     // After estimated fees
  estimatedFeePct: number;
  liquidity: number;
  detectedAt: number;
}

export interface ArbMarketLeg {
  marketId: string;
  question: string;
  tokenId: string;
  side: "YES" | "NO";
  bestAsk: number;
  availableSize: number;
}

// Polymarket fee: ~2% on winnings. The actual fee structure is:
// - No fee to buy/sell on the order book
// - 2% fee on net winnings at resolution
const RESOLUTION_FEE_PCT = 0.02;

// ── Detector ──

export class ArbDetector {
  private client: PolymarketClient;
  private config: PolypooterConfig;

  constructor(client: PolymarketClient, config: PolypooterConfig) {
    this.client = client;
    this.config = config;
  }

  /** Scan all active events for arbitrage opportunities */
  async scan(): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    // Fetch active events (includes their markets)
    const events = await this.client.getActiveEvents(200);

    for (const event of events) {
      if (!event.active || event.closed) continue;
      if (event.liquidity < this.config.minLiquidityUsd) continue;

      try {
        // Strategy 1: Completeness arb on binary markets
        const binaryArbs = await this.detectCompletenessArbs(event);
        opportunities.push(...binaryArbs);

        // Strategy 2: Multi-outcome arb (events with >2 markets)
        if (event.markets.length > 2) {
          const multiArbs = await this.detectMultiOutcomeArbs(event);
          opportunities.push(...multiArbs);
        }
      } catch (err) {
        console.warn(`[polypooter] scan error for event "${event.title}":`, err);
      }
    }

    // Sort by net profit descending
    opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);

    return opportunities.slice(0, this.config.maxStoredOpportunities);
  }

  /**
   * Strategy 1: Completeness Arb
   *
   * For each binary market: fetch order books for YES and NO tokens.
   * If bestAsk(YES) + bestAsk(NO) < 1.00, there's an arb.
   * After resolution fee on the $1.00 payout: net = 1.00*(1-fee) - cost
   */
  private async detectCompletenessArbs(event: PolymarketEvent): Promise<ArbOpportunity[]> {
    const arbs: ArbOpportunity[] = [];

    for (const market of event.markets) {
      if (!market.active || market.closed) continue;
      if (market.clobTokenIds.length < 2) continue;

      const [yesTokenId, noTokenId] = market.clobTokenIds;

      // Fetch order books in parallel
      const [yesBook, noBook] = await Promise.all([
        this.client.getBook(yesTokenId),
        this.client.getBook(noTokenId),
      ]);

      // Best ask = cheapest price to buy
      const yesBestAsk = yesBook.asks.length > 0 ? parseFloat(yesBook.asks[0].price) : 1;
      const noBestAsk = noBook.asks.length > 0 ? parseFloat(noBook.asks[0].price) : 1;
      const yesAskSize = yesBook.asks.length > 0 ? parseFloat(yesBook.asks[0].size) : 0;
      const noAskSize = noBook.asks.length > 0 ? parseFloat(noBook.asks[0].size) : 0;

      const totalCost = yesBestAsk + noBestAsk;
      const guaranteedReturn = 1.0;
      const netReturn = guaranteedReturn * (1 - RESOLUTION_FEE_PCT);
      const spreadPct = (guaranteedReturn - totalCost) / totalCost;
      const netProfitPct = (netReturn - totalCost) / totalCost;

      if (netProfitPct >= this.config.minArbSpreadPct) {
        arbs.push({
          id: `completeness:${market.id}`,
          strategy: "completeness",
          eventTitle: event.title,
          markets: [
            {
              marketId: market.id,
              question: market.question,
              tokenId: yesTokenId,
              side: "YES",
              bestAsk: yesBestAsk,
              availableSize: yesAskSize,
            },
            {
              marketId: market.id,
              question: market.question,
              tokenId: noTokenId,
              side: "NO",
              bestAsk: noBestAsk,
              availableSize: noAskSize,
            },
          ],
          totalCost,
          guaranteedReturn,
          spreadPct,
          netProfitPct,
          estimatedFeePct: RESOLUTION_FEE_PCT,
          liquidity: market.liquidity,
          detectedAt: Date.now(),
        });
      }
    }

    return arbs;
  }

  /**
   * Strategy 2: Multi-Outcome Arb
   *
   * For events with mutually exclusive outcomes (e.g. "Who wins?"):
   * Sum the cheapest YES price across all outcomes.
   * If sum < $1.00, buying YES on every outcome guarantees profit
   * (exactly one must resolve YES).
   */
  private async detectMultiOutcomeArbs(event: PolymarketEvent): Promise<ArbOpportunity[]> {
    const activeMarkets = event.markets.filter((m) => m.active && !m.closed && m.clobTokenIds.length >= 1);
    if (activeMarkets.length < 3) return [];

    const legs: ArbMarketLeg[] = [];
    let totalCost = 0;

    for (const market of activeMarkets) {
      const yesTokenId = market.clobTokenIds[0];
      try {
        const book = await this.client.getBook(yesTokenId);
        const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
        const askSize = book.asks.length > 0 ? parseFloat(book.asks[0].size) : 0;

        legs.push({
          marketId: market.id,
          question: market.question || market.groupItemTitle || "Unknown",
          tokenId: yesTokenId,
          side: "YES",
          bestAsk,
          availableSize: askSize,
        });
        totalCost += bestAsk;
      } catch {
        // Skip markets we can't price
        return [];
      }
    }

    const guaranteedReturn = 1.0;
    const netReturn = guaranteedReturn * (1 - RESOLUTION_FEE_PCT);
    const spreadPct = (guaranteedReturn - totalCost) / totalCost;
    const netProfitPct = (netReturn - totalCost) / totalCost;

    if (netProfitPct >= this.config.minArbSpreadPct) {
      return [{
        id: `multi-outcome:${event.id}`,
        strategy: "multi-outcome",
        eventTitle: event.title,
        markets: legs,
        totalCost,
        guaranteedReturn,
        spreadPct,
        netProfitPct,
        estimatedFeePct: RESOLUTION_FEE_PCT,
        liquidity: event.liquidity,
        detectedAt: Date.now(),
      }];
    }

    return [];
  }
}
