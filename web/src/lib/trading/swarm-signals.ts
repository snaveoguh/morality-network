/**
 * swarm-signals.ts — Convert research swarm clusters into trading signals.
 *
 * The research swarm clusters 70+ RSS feeds into emerging events with
 * contradiction detection and multi-source corroboration. This module
 * converts those clusters into AggregatedMarketSignal objects that the
 * composite signal can consume as news signals.
 *
 * Flow: runResearchSwarm() → clusters → aggregateSwarmSignals() →
 *       persistSwarmSignals() → pooter.signals → getAggregatedMarketSignals()
 *       reads via fetchAggregatedNewsSignalsFromPostgres → computeCompositeSignal()
 */

import type { EmergingEventCluster, AgentContradictionFlag } from "../agent-swarm.js";
import type { AggregatedMarketSignal } from "./signals.js";
import {
  recordSignalsBatch,
  getRecentSignals,
  type RecordSignalInput,
} from "../db/signals";

/* ═══════════════════  Symbol extraction  ═══════════════════ */

/**
 * Pattern-based symbol extraction — reuses the same regex patterns as
 * signals.ts SYMBOL_PATTERNS but applied to cluster tags + canonical claim.
 */
const SYMBOL_PATTERNS: Array<{ symbol: string; pattern: RegExp }> = [
  { symbol: "BTC", pattern: /\b(bitcoin|btc|xbt|crypto(?:currency)?|digital\s*assets?)\b/i },
  { symbol: "ETH", pattern: /\b(ethereum|eth|l2|layer\s*2|rollup|defi)\b/i },
  { symbol: "SOL", pattern: /\b(solana|sol)\b/i },
  { symbol: "DOGE", pattern: /\b(doge|dogecoin|meme\s*coin)\b/i },
  { symbol: "AVAX", pattern: /\b(avalanche|avax)\b/i },
  { symbol: "LINK", pattern: /\b(chainlink|link|oracle)\b/i },
  { symbol: "ARB", pattern: /\b(arbitrum|arb)\b/i },
  { symbol: "OP", pattern: /\b(optimism)\b/i },
  { symbol: "XRP", pattern: /\b(xrp|ripple)\b/i },
  { symbol: "HYPE", pattern: /\b(hyperliquid|hype)\b/i },
  { symbol: "SUI", pattern: /\b(sui)\b/i },
  { symbol: "PAXG", pattern: /\b(gold|xau|bullion|precious\s*metal)\b/i },
  { symbol: "ZEC", pattern: /\b(zcash|zec|privacy\s*coin)\b/i },
  { symbol: "TRUMP", pattern: /\b(trump)\b/i },
  { symbol: "WLD", pattern: /\b(worldcoin|wld)\b/i },
  { symbol: "FET", pattern: /\b(fetch\.?ai|fet)\b/i },
  { symbol: "TAO", pattern: /\b(bittensor|tao)\b/i },
  { symbol: "AAVE", pattern: /\b(aave)\b/i },
  { symbol: "BNB", pattern: /\b(binance|bnb)\b/i },
  { symbol: "BCH", pattern: /\b(bitcoin\s*cash|bch)\b/i },
  // Macro proxies — map geopolitical/economic events to tradeable assets
  { symbol: "BTC", pattern: /\b(inflation|money\s*printing|quantitative|central\s*bank|fed\b|monetary\s*policy)\b/i },
  { symbol: "PAXG", pattern: /\b(war|conflict|geopolitical|sanctions?|safe\s*haven|uncertainty)\b/i },
  { symbol: "BTC", pattern: /\b(regulation|sec\b|crypto\s*ban|crypto\s*law|stablecoin\s*bill)\b/i },
  { symbol: "ETH", pattern: /\b(nft|web3|smart\s*contract|dao\b|governance\s*token)\b/i },
];

/**
 * Extract trading symbols from cluster tags and canonical claim text.
 * Returns deduplicated list of symbols.
 */
export function extractTradingSymbols(tags: string[], canonicalClaim: string): string[] {
  const symbols = new Set<string>();
  const searchText = `${tags.join(" ")} ${canonicalClaim}`;

  for (const { symbol, pattern } of SYMBOL_PATTERNS) {
    if (pattern.test(searchText)) {
      symbols.add(symbol);
    }
  }

  return Array.from(symbols);
}

/* ═══════════════════  Polarity detection  ═══════════════════ */

const BEARISH_WORDS = [
  "declined", "fell", "crashed", "crash", "plunged", "plunge", "drop", "dropped",
  "loss", "losses", "risk", "concern", "worried", "fear", "threat", "ban",
  "banned", "restrict", "restricted", "sanction", "sanctioned", "hack", "hacked",
  "exploit", "breach", "violated", "fail", "failed", "failure", "collapse",
  "collapsed", "fraud", "scam", "lawsuit", "sued", "charged", "indicted",
  "recession", "downturn", "bearish", "sell-off", "selloff", "warning",
  "downgrade", "negative", "worst", "crisis", "default", "bankrupt", "bankruptcy",
  // Extended — common headline language
  "slips", "slipped", "slides", "tumbles", "tumbled", "sinks", "sank", "weakens",
  "weakened", "retreats", "retreated", "struggles", "stumbles", "stalls", "stalled",
  "plummets", "dips", "dipped", "erases", "erased", "loses", "losing",
  "tensions", "escalation", "escalates", "war", "conflict", "attack", "attacks",
  "crackdown", "probe", "investigation", "penalty", "fine", "fined",
  "delays", "delayed", "postpone", "postponed", "suspend", "suspended",
  "outflow", "outflows", "withdraw", "withdrawal", "liquidation", "liquidated",
  "volatility", "uncertain", "instability", "contagion", "panic",
  "below", "under", "beneath", "lowest", "bottom", "floor",
];

const BULLISH_WORDS = [
  "announced", "approved", "launched", "launch", "surge", "surged", "gained",
  "gain", "rally", "rallied", "record", "profit", "success", "bullish",
  "upgrade", "adopted", "adoption", "partnership", "invest", "invested",
  "investment", "fund", "funded", "milestone", "breakthrough", "innovation",
  "growth", "growing", "positive", "best", "all-time high", "ath",
  "accumulate", "accumulating", "institutional", "etf", "inflow", "inflows",
  // Extended — common headline language
  "rises", "rising", "climbs", "climbing", "jumps", "jumped", "soars", "soared",
  "rebounds", "rebounded", "recovers", "recovered", "strengthens", "strengthened",
  "tops", "topped", "exceeds", "exceeded", "breaks", "broke", "hits",
  "deal", "deals", "agreement", "signed", "signing", "expands", "expansion",
  "demand", "demands", "reopening", "resumes", "resumed", "restores", "restored",
  "lifts", "lifted", "eases", "eased", "cuts", "cut", "boost", "boosted",
  "above", "over", "highest", "peak", "top", "ceiling", "new high",
  "confidence", "optimism", "momentum", "acceleration", "accumulation",
];

/**
 * Detect directional polarity of a cluster's canonical claim.
 * Returns null if ambiguous or contradicted.
 */
export function detectClusterPolarity(
  canonicalClaim: string,
  contradictionFlags: AgentContradictionFlag[],
): "bullish" | "bearish" | null {
  const lower = canonicalClaim.toLowerCase();

  let bearishHits = 0;
  let bullishHits = 0;

  for (const w of BEARISH_WORDS) {
    if (lower.includes(w)) bearishHits++;
  }
  for (const w of BULLISH_WORDS) {
    if (lower.includes(w)) bullishHits++;
  }

  // Heavy contradictions = too noisy for a directional call
  if (contradictionFlags.length >= 3) return null;

  // Contradiction penalty: discount the weaker side
  const contradictionDiscount = contradictionFlags.length > 0 ? 0.5 : 0;

  const netBullish = bullishHits - (bearishHits * contradictionDiscount);
  const netBearish = bearishHits - (bullishHits * contradictionDiscount);

  if (netBullish > netBearish && bullishHits >= 1) return "bullish";
  if (netBearish > netBullish && bearishHits >= 1) return "bearish";

  return null;
}

/* ═══════════════════  Source credibility  ═══════════════════ */

const HIGH_TRUST_SOURCES = [
  "reuters", "associated press", "afp", "bbc", "financial times",
  "wall street journal", "bloomberg", "economist", "npr",
];

const MEDIUM_TRUST_SOURCES = [
  "coindesk", "cointelegraph", "the block", "techcrunch", "cnbc",
  "guardian", "al jazeera", "nature", "science",
];

function sourceCredibilityBoost(sources: string[]): number {
  let boost = 0;
  for (const source of sources) {
    const lower = source.toLowerCase();
    if (HIGH_TRUST_SOURCES.some((s) => lower.includes(s))) {
      boost = Math.max(boost, 0.10);
    } else if (MEDIUM_TRUST_SOURCES.some((s) => lower.includes(s))) {
      boost = Math.max(boost, 0.05);
    }
  }
  return boost;
}

/* ═══════════════════  Cluster → Signal  ═══════════════════ */

/**
 * Convert a single swarm cluster to trading signals.
 * Returns one signal per detected symbol, or empty if no symbols or polarity.
 */
export function clusterToSignals(cluster: EmergingEventCluster): AggregatedMarketSignal[] {
  const symbols = extractTradingSymbols(cluster.tags, cluster.canonicalClaim);
  if (symbols.length === 0) return [];

  const polarity = detectClusterPolarity(cluster.canonicalClaim, cluster.contradictionFlags);
  if (polarity === null) return [];

  // Cluster strength: itemCount 2+ sources → confidence scaling
  // 2 sources = 0.35, 5 sources = 0.55, 10+ sources = 0.75
  const baseScore = Math.min(0.75, 0.25 + (cluster.itemCount * 0.06));

  // Contradiction penalty: 0-2 flags reduce confidence
  const contradictionPenalty = Math.min(0.4, cluster.contradictionFlags.length * 0.15);
  const penalizedScore = baseScore * (1 - contradictionPenalty);

  // Source credibility boost
  const credBoost = sourceCredibilityBoost(cluster.sources);

  const finalScore = Math.min(1, penalizedScore + credBoost);

  // Skip very weak signals
  if (finalScore < 0.2) return [];

  const claims = [
    cluster.canonicalClaim,
    ...cluster.evidence.slice(0, 2).map((e) => e.summary || e.title),
  ].filter(Boolean);

  return symbols.map((symbol) => ({
    symbol,
    direction: polarity,
    score: finalScore,
    observations: cluster.itemCount,
    latestGeneratedAt: cluster.latestPubDate,
    supportingClaims: claims.slice(0, 3),
    contradictionPenalty,
    bullishWeight: polarity === "bullish" ? finalScore : 0,
    bearishWeight: polarity === "bearish" ? finalScore : 0,
    rawScore: polarity === "bullish" ? finalScore : -finalScore,
  }));
}

/* ═══════════════════  Main aggregator  ═══════════════════ */

/**
 * Aggregate all swarm clusters into a per-symbol signal map.
 * When multiple clusters map to the same symbol, keeps the strongest.
 * When directions conflict for the same symbol, the stronger signal wins
 * but gets a contradiction penalty applied.
 */
export function aggregateSwarmSignals(
  clusters: EmergingEventCluster[],
): AggregatedMarketSignal[] {
  const bySymbol = new Map<string, AggregatedMarketSignal>();

  for (const cluster of clusters) {
    const symbols = extractTradingSymbols(cluster.tags, cluster.canonicalClaim);
    const polarity = detectClusterPolarity(cluster.canonicalClaim, cluster.contradictionFlags);
    if (symbols.length === 0 || polarity === null) {
      console.log(
        `[swarm-signals] skip cluster: symbols=${symbols.length} polarity=${polarity} claim="${cluster.canonicalClaim.slice(0, 80)}" tags=[${cluster.tags.slice(0, 5).join(",")}]`,
      );
    }
    const signals = clusterToSignals(cluster);
    for (const signal of signals) {
      const existing = bySymbol.get(signal.symbol);
      if (!existing) {
        bySymbol.set(signal.symbol, signal);
        continue;
      }

      // Same direction: merge (boost confidence with more observations)
      if (existing.direction === signal.direction) {
        const merged: AggregatedMarketSignal = {
          ...existing,
          score: Math.min(1, existing.score + signal.score * 0.3),
          observations: existing.observations + signal.observations,
          supportingClaims: [
            ...existing.supportingClaims,
            ...signal.supportingClaims,
          ].slice(0, 5),
          bullishWeight: existing.bullishWeight + signal.bullishWeight,
          bearishWeight: existing.bearishWeight + signal.bearishWeight,
          rawScore: existing.rawScore + signal.rawScore * 0.3,
          // Keep the more recent timestamp
          latestGeneratedAt:
            signal.latestGeneratedAt > existing.latestGeneratedAt
              ? signal.latestGeneratedAt
              : existing.latestGeneratedAt,
        };
        bySymbol.set(signal.symbol, merged);
      } else {
        // Conflicting directions: keep stronger, add penalty
        if (signal.score > existing.score) {
          bySymbol.set(signal.symbol, {
            ...signal,
            contradictionPenalty: Math.min(1, signal.contradictionPenalty + 0.3),
            score: signal.score * 0.7, // 30% penalty for conflict
          });
        } else {
          bySymbol.set(existing.symbol, {
            ...existing,
            contradictionPenalty: Math.min(1, existing.contradictionPenalty + 0.3),
            score: existing.score * 0.7,
          });
        }
      }
    }
  }

  return Array.from(bySymbol.values());
}

/* ═══════════════════  Persistence (Postgres)  ═══════════════════ */

const SIGNAL_TTL_SECONDS = 2 * 60 * 60; // 2 hours — news doesn't change that fast

/**
 * Persist swarm signals. Returns true when at least one row was written.
 * Postgres is the sole signal store after Stage 3c.
 */
export async function persistSwarmSignals(
  signals: AggregatedMarketSignal[],
): Promise<boolean> {
  try {
    const written = await persistSwarmSignalsToPostgres(signals);
    return written > 0;
  } catch (err) {
    console.warn(
      "[swarm-signals] Postgres write failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Write swarm signals to pooter.signals. Each call inserts a fresh row per
 * symbol — IDs are timestamped so re-runs don't collide. TTL matches the
 * 2-hour news window.
 */
export async function persistSwarmSignalsToPostgres(
  signals: AggregatedMarketSignal[],
): Promise<number> {
  if (signals.length === 0) return 0;
  const now = new Date();
  const ttlExpiresAt = new Date(now.getTime() + SIGNAL_TTL_SECONDS * 1000);
  const rows: RecordSignalInput[] = signals.map((s) => ({
    id: `swarm-${now.toISOString()}-${s.symbol}`,
    producedAt: now,
    producedBy: "swarm",
    symbol: s.symbol,
    direction: s.direction,
    strength: Math.max(0, Math.min(1, s.score)),
    score: s.rawScore,
    claim: s.supportingClaims[0] ?? null,
    contradictionCount: s.contradictionPenalty > 0 ? Math.round(s.contradictionPenalty * 10) : 0,
    sourceDetail: {
      observations: s.observations,
      latestGeneratedAt: s.latestGeneratedAt,
      supportingClaims: s.supportingClaims,
      bullishWeight: s.bullishWeight,
      bearishWeight: s.bearishWeight,
      contradictionPenalty: s.contradictionPenalty,
    },
    ttlExpiresAt,
  }));
  await recordSignalsBatch(rows);
  return rows.length;
}

/**
 * Read recent swarm + editorial signals from Postgres and collapse to one
 * AggregatedMarketSignal per symbol — the most recent strong signal wins.
 *
 * Postgres carries every producer's output (swarm, editorial, council, …)
 * so the trader sees the full news picture from a single read.
 */
export async function fetchAggregatedNewsSignalsFromPostgres(
  lookbackHours = 2,
): Promise<AggregatedMarketSignal[]> {
  const rows = await getRecentSignals(lookbackHours, 500);
  const bySymbol = new Map<string, AggregatedMarketSignal>();

  for (const row of rows) {
    if (row.direction === "neutral") continue;
    if (bySymbol.has(row.symbol)) continue; // rows are DESC by produced_at, first wins

    const detail = (row.source_detail ?? {}) as Record<string, unknown>;
    const direction = row.direction;
    const score = Math.max(0, Math.min(1, row.strength));

    const observations =
      typeof detail.observations === "number" ? detail.observations : 1;
    const latestGeneratedAt =
      typeof detail.latestGeneratedAt === "string"
        ? detail.latestGeneratedAt
        : row.produced_at.toISOString();
    const supportingClaims = Array.isArray(detail.supportingClaims)
      ? (detail.supportingClaims as string[])
      : row.claim
        ? [row.claim]
        : [];
    const bullishWeight =
      typeof detail.bullishWeight === "number"
        ? detail.bullishWeight
        : direction === "bullish"
          ? score
          : 0;
    const bearishWeight =
      typeof detail.bearishWeight === "number"
        ? detail.bearishWeight
        : direction === "bearish"
          ? score
          : 0;
    const contradictionPenalty =
      typeof detail.contradictionPenalty === "number"
        ? detail.contradictionPenalty
        : 0;

    bySymbol.set(row.symbol, {
      symbol: row.symbol,
      direction,
      score,
      observations,
      latestGeneratedAt,
      supportingClaims,
      contradictionPenalty,
      bullishWeight,
      bearishWeight,
      rawScore: row.score ?? (direction === "bullish" ? score : -score),
    });
  }

  return Array.from(bySymbol.values());
}
