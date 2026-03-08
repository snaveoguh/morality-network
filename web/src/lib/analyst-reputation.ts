import { type Address } from "viem";
import {
  buildInterpretationOutcomeScores,
  type InterpretationOutcomeScore,
} from "./interpretation-scores";
import { PREDICTION_MARKET_ADDRESS } from "./contracts";

const DEFAULT_LOOKBACK_BLOCKS = BigInt("90000");

interface TopicAggregate {
  total: number;
  correct: number;
  scoreSum: number;
}

interface AnalystAggregate {
  address: Address;
  totalInterpretations: number;
  correctInterpretations: number;
  incorrectInterpretations: number;
  confidenceSum: number;
  outcomeScoreSum: number;
  stakeEthSum: number;
  netSignalEth: number;
  evidenceCount: number;
  topicStats: Map<string, TopicAggregate>;
}

export interface TopicExpertise {
  topic: string;
  predictions: number;
  accuracy: number;
  avgOutcomeScore: number;
}

export interface AnalystReputation {
  address: Address;
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  predictionAccuracy: number;
  averageConfidence: number;
  influenceScore: number;
  interpretationScore: number;
  credibilityScore: number;
  totalStakedEth: number;
  netSignalEth: number;
  topicExpertise: TopicExpertise[];
}

export interface AnalystReputationSnapshot {
  generatedAt: string;
  marketAddress: Address;
  scannedFromBlock: string;
  scannedToBlock: string;
  resolvedMarkets: number;
  scoredInterpretations: number;
  scoringUnit: "interpretation";
  analysts: AnalystReputation[];
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toPct(v: number): number {
  return Math.round(v * 10000) / 100;
}

function normalizeScore(score: number): number {
  return clamp01((score + 100) / 200);
}

function aggregateByAnalyst(interpretations: InterpretationOutcomeScore[]) {
  const map = new Map<string, AnalystAggregate>();

  for (const item of interpretations) {
    const key = item.author.toLowerCase();
    const current = map.get(key) || {
      address: item.author,
      totalInterpretations: 0,
      correctInterpretations: 0,
      incorrectInterpretations: 0,
      confidenceSum: 0,
      outcomeScoreSum: 0,
      stakeEthSum: 0,
      netSignalEth: 0,
      evidenceCount: 0,
      topicStats: new Map<string, TopicAggregate>(),
    };

    current.totalInterpretations += 1;
    current.correctInterpretations += item.wasCorrect ? 1 : 0;
    current.incorrectInterpretations += item.wasCorrect ? 0 : 1;
    current.confidenceSum += item.confidence;
    current.outcomeScoreSum += item.outcomeScore;
    current.stakeEthSum += item.stakeEth;
    current.netSignalEth += item.wasCorrect ? item.stakeEth : -item.stakeEth;
    current.evidenceCount += item.hasEvidence ? 1 : 0;

    const topicKey = item.dao.toLowerCase();
    const topic = current.topicStats.get(topicKey) || {
      total: 0,
      correct: 0,
      scoreSum: 0,
    };
    topic.total += 1;
    topic.correct += item.wasCorrect ? 1 : 0;
    topic.scoreSum += item.outcomeScore;
    current.topicStats.set(topicKey, topic);

    map.set(key, current);
  }

  return map;
}

export async function buildAnalystReputationFromPredictionMarkets(
  options?: {
    lookbackBlocks?: bigint;
    minPredictions?: number;
    limit?: number;
  }
): Promise<AnalystReputationSnapshot> {
  const minPredictions = Math.max(1, options?.minPredictions ?? 2);
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));

  const empty: AnalystReputationSnapshot = {
    generatedAt: new Date().toISOString(),
    marketAddress: PREDICTION_MARKET_ADDRESS,
    scannedFromBlock: "0",
    scannedToBlock: "0",
    resolvedMarkets: 0,
    scoredInterpretations: 0,
    scoringUnit: "interpretation",
    analysts: [],
  };

  try {
    const interpretationSnapshot = await buildInterpretationOutcomeScores({
      lookbackBlocks: options?.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS,
      // Fetch broad pool first, then derive top analysts.
      limit: Math.max(limit * 30, 800),
      maxCommentCandidates: 1600,
      minOutcomeScore: -100,
      onlyCorrect: false,
      requireStructured: true,
      requireEvidence: true,
    });

    const aggregated = aggregateByAnalyst(interpretationSnapshot.interpretations);

    const filtered = Array.from(aggregated.values()).filter(
      (analyst) => analyst.totalInterpretations >= minPredictions
    );

    let maxInfluenceRaw = 0;
    const influenceRawByAddress = new Map<string, number>();

    for (const analyst of filtered) {
      const raw = Math.log10(1 + analyst.stakeEthSum + Math.abs(analyst.netSignalEth));
      influenceRawByAddress.set(analyst.address.toLowerCase(), raw);
      if (raw > maxInfluenceRaw) maxInfluenceRaw = raw;
    }

    const analysts: AnalystReputation[] = filtered
      .map((analyst) => {
        const total = analyst.totalInterpretations;
        const accuracy = total > 0 ? analyst.correctInterpretations / total : 0;
        const avgConfidence = total > 0 ? analyst.confidenceSum / total : 0;
        const avgOutcomeScore = total > 0 ? analyst.outcomeScoreSum / total : 0;
        const interpretationScoreNorm = normalizeScore(avgOutcomeScore);
        const evidenceRate = total > 0 ? analyst.evidenceCount / total : 0;

        const influenceRaw = influenceRawByAddress.get(analyst.address.toLowerCase()) || 0;
        const influence = maxInfluenceRaw > 0 ? influenceRaw / maxInfluenceRaw : 0;

        // Derived reputation: ideas first, person second.
        const credibility = clamp01(
          accuracy * 0.55 + interpretationScoreNorm * 0.3 + evidenceRate * 0.15
        );

        const topicExpertise = Array.from(analyst.topicStats.entries())
          .map(([topic, stats]) => {
            const topicAccuracy = stats.total > 0 ? stats.correct / stats.total : 0;
            const topicAvgScore = stats.total > 0 ? stats.scoreSum / stats.total : 0;
            return {
              topic,
              predictions: stats.total,
              accuracy: toPct(topicAccuracy),
              avgOutcomeScore: Math.round(topicAvgScore * 10) / 10,
            };
          })
          .sort((a, b) => {
            if (b.predictions !== a.predictions) return b.predictions - a.predictions;
            return b.accuracy - a.accuracy;
          })
          .slice(0, 4);

        return {
          address: analyst.address,
          totalPredictions: analyst.totalInterpretations,
          correctPredictions: analyst.correctInterpretations,
          incorrectPredictions: analyst.incorrectInterpretations,
          predictionAccuracy: toPct(accuracy),
          averageConfidence: toPct(avgConfidence),
          influenceScore: toPct(influence),
          interpretationScore: toPct(interpretationScoreNorm),
          credibilityScore: toPct(credibility),
          totalStakedEth: Number(analyst.stakeEthSum.toFixed(4)),
          netSignalEth: Number(analyst.netSignalEth.toFixed(4)),
          topicExpertise,
        };
      })
      .sort((a, b) => {
        if (b.credibilityScore !== a.credibilityScore) {
          return b.credibilityScore - a.credibilityScore;
        }
        if (b.totalPredictions !== a.totalPredictions) {
          return b.totalPredictions - a.totalPredictions;
        }
        return b.netSignalEth - a.netSignalEth;
      })
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      marketAddress: interpretationSnapshot.marketAddress,
      scannedFromBlock: interpretationSnapshot.scannedFromBlock,
      scannedToBlock: interpretationSnapshot.scannedToBlock,
      resolvedMarkets: interpretationSnapshot.resolvedMarkets,
      scoredInterpretations: interpretationSnapshot.scoredInterpretations,
      scoringUnit: "interpretation",
      analysts,
    };
  } catch (error) {
    console.error("[analyst-reputation] failed to compute", error);
    return empty;
  }
}
