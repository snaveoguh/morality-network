import "server-only";

import { computeCompositeSignal } from "./composite-signal";
import { getTraderConfig } from "./config";
import { detectPatterns } from "./pattern-detector";
import { getAggregatedMarketSignals } from "./signals";
import { fetchTechnicalSignal } from "./technical";

type CandidateDirection = "long" | "short" | "neutral";

interface CandidateComponentDirection {
  direction: CandidateDirection;
}

export interface ExecutionCandidate {
  symbol: string;
  direction: CandidateDirection;
  confidence: number;
  agreementMet: boolean;
  eligible: boolean;
  hasSignal: boolean;
  sourceCount: number;
  components: {
    technical: {
      direction: CandidateDirection;
      strength: number;
    } | null;
    pattern: {
      direction: CandidateDirection;
      patterns: string[];
    } | null;
    news: {
      direction: CandidateDirection;
      score: number;
    } | null;
  };
  reasons: string[];
}

export interface ExecutionCandidateSnapshot {
  timestamp: number;
  minConfidence: number;
  markets: ExecutionCandidate[];
}

interface ExecutionCandidateCacheEntry {
  expiresAt: number;
  promise: Promise<ExecutionCandidateSnapshot> | null;
  snapshot: ExecutionCandidateSnapshot | null;
}

const EXECUTION_CANDIDATE_CACHE_TTL_MS = 15_000;

let executionCandidateCache: ExecutionCandidateCacheEntry = {
  expiresAt: 0,
  promise: null,
  snapshot: null,
};

function hasCandidateComponent(
  component: CandidateComponentDirection | null,
): component is CandidateComponentDirection {
  return component !== null && component.direction !== "neutral";
}

function rankCandidate(a: ExecutionCandidate, b: ExecutionCandidate): number {
  if (a.eligible !== b.eligible) {
    return a.eligible ? -1 : 1;
  }
  if (a.direction !== b.direction) {
    if (a.direction === "neutral") return 1;
    if (b.direction === "neutral") return -1;
  }
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }
  if (a.sourceCount !== b.sourceCount) {
    return b.sourceCount - a.sourceCount;
  }
  return a.symbol.localeCompare(b.symbol);
}

async function computeExecutionCandidateSnapshot(): Promise<ExecutionCandidateSnapshot> {
  const config = getTraderConfig();
  const watchMarkets = config.hyperliquid.watchMarkets;

  let newsSignals: Awaited<ReturnType<typeof getAggregatedMarketSignals>> = [];
  try {
    newsSignals = await getAggregatedMarketSignals({ limit: 250, minAbsScore: 0.2 });
  } catch {
    newsSignals = [];
  }

  const markets = await Promise.all(
    watchMarkets.map(async (symbol) => {
      try {
        const technical = await fetchTechnicalSignal(config, symbol);
        const pattern = await detectPatterns(config, symbol, technical);
        const newsSignal =
          newsSignals.find((signal) => signal.symbol.toUpperCase() === symbol.toUpperCase()) ??
          null;

        const composite = computeCompositeSignal({
          symbol,
          technical,
          pattern,
          newsSignal,
          minConfidence: config.risk.minSignalConfidence,
        });

        const candidate: ExecutionCandidate = {
          symbol,
          direction: composite.direction,
          confidence: composite.confidence,
          agreementMet: composite.agreementMet,
          eligible:
            composite.direction !== "neutral" &&
            composite.agreementMet &&
            composite.confidence >= config.risk.minSignalConfidence,
          hasSignal:
            hasCandidateComponent(composite.components.technical) ||
            hasCandidateComponent(composite.components.pattern) ||
            hasCandidateComponent(composite.components.news),
          sourceCount: [
            composite.components.technical,
            composite.components.pattern,
            composite.components.news,
          ].filter(hasCandidateComponent).length,
          components: {
            technical: composite.components.technical
              ? {
                  direction: composite.components.technical.direction,
                  strength: composite.components.technical.strength,
                }
              : null,
            pattern: composite.components.pattern
              ? {
                  direction: composite.components.pattern.direction,
                  patterns: composite.components.pattern.patterns,
                }
              : null,
            news: composite.components.news
              ? {
                  direction: composite.components.news.direction,
                  score: composite.components.news.score,
                }
              : null,
          },
          reasons: composite.reasons,
        };

        return candidate;
      } catch (error) {
        return {
          symbol,
          direction: "neutral",
          confidence: 0,
          agreementMet: false,
          eligible: false,
          hasSignal: false,
          sourceCount: 0,
          components: {
            technical: null,
            pattern: null,
            news: null,
          },
          reasons: [error instanceof Error ? error.message : "Failed to compute composite signal"],
        } satisfies ExecutionCandidate;
      }
    }),
  );

  markets.sort(rankCandidate);

  return {
    timestamp: Date.now(),
    minConfidence: config.risk.minSignalConfidence,
    markets,
  };
}

export async function getExecutionCandidateSnapshot(): Promise<ExecutionCandidateSnapshot> {
  const now = Date.now();
  if (executionCandidateCache.snapshot && executionCandidateCache.expiresAt > now) {
    return executionCandidateCache.snapshot;
  }

  if (!executionCandidateCache.promise) {
    executionCandidateCache.promise = computeExecutionCandidateSnapshot()
      .then((snapshot) => {
        executionCandidateCache.snapshot = snapshot;
        executionCandidateCache.expiresAt = Date.now() + EXECUTION_CANDIDATE_CACHE_TTL_MS;
        return snapshot;
      })
      .finally(() => {
        executionCandidateCache.promise = null;
      });
  }

  if (executionCandidateCache.promise) {
    return executionCandidateCache.promise;
  }

  return computeExecutionCandidateSnapshot();
}
