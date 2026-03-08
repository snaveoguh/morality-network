import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { PREDICTION_MARKET_ADDRESS } from "./contracts";

const DEFAULT_RPC_URL = "https://sepolia.base.org";
const DEFAULT_LOOKBACK_BLOCKS = BigInt("90000");
const LOG_CHUNK_SIZE = BigInt("9000");
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);

const MARKET_CREATED_EVENT = parseAbiItem(
  "event MarketCreated(bytes32 indexed proposalKey, string dao, string proposalId)"
);
const STAKE_PLACED_EVENT = parseAbiItem(
  "event StakePlaced(bytes32 indexed proposalKey, address indexed staker, bool isFor, uint256 amount)"
);
const MARKET_RESOLVED_EVENT = parseAbiItem(
  "event MarketResolved(bytes32 indexed proposalKey, uint8 outcome)"
);

const OUTCOME_FOR = 1;
const OUTCOME_AGAINST = 2;

interface StakeSide {
  forStake: bigint;
  againstStake: bigint;
}

interface MarketAggregate {
  key: string;
  dao: string;
  proposalId: string;
  outcome?: number;
  stakesByUser: Map<string, StakeSide>;
}

interface DaoAccuracy {
  total: number;
  correct: number;
  stakeWei: bigint;
}

interface AnalystAggregate {
  address: Address;
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  confidenceSum: number;
  dominantStakeWei: bigint;
  netSignalWei: bigint;
  daoStats: Map<string, DaoAccuracy>;
}

export interface TopicExpertise {
  topic: string;
  predictions: number;
  accuracy: number;
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
  analysts: AnalystReputation[];
}

function getRpcUrl(): string {
  return (
    process.env.BASE_SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

async function getLogsChunked<TEvent>(
  client: any,
  address: Address,
  event: TEvent,
  fromBlock: bigint,
  toBlock: bigint
) {
  const logs: any[] = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const upper = start + LOG_CHUNK_SIZE - BIGINT_ONE;
    const end = upper > toBlock ? toBlock : upper;
    const chunk = await client.getLogs({
      address,
      event: event as any,
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...chunk);
    start = end + BIGINT_ONE;
  }

  return logs;
}

function toEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

function toPct(v: number): number {
  return Math.round(v * 10000) / 100;
}

export async function buildAnalystReputationFromPredictionMarkets(
  options?: {
    lookbackBlocks?: bigint;
    minPredictions?: number;
    limit?: number;
  }
): Promise<AnalystReputationSnapshot> {
  const marketAddress = PREDICTION_MARKET_ADDRESS;
  const minPredictions = Math.max(1, options?.minPredictions ?? 2);
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));

  const empty: AnalystReputationSnapshot = {
    generatedAt: new Date().toISOString(),
    marketAddress,
    scannedFromBlock: "0",
    scannedToBlock: "0",
    resolvedMarkets: 0,
    analysts: [],
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(marketAddress) || /^0x0+$/.test(marketAddress)) {
    return empty;
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(getRpcUrl()),
  });

  try {
    const latestBlock = await client.getBlockNumber();
    const lookback = options?.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
    const fromBlock = latestBlock > lookback ? latestBlock - lookback : BIGINT_ZERO;

    const [createdLogs, stakeLogs, resolvedLogs] = await Promise.all([
      getLogsChunked(client, marketAddress, MARKET_CREATED_EVENT, fromBlock, latestBlock),
      getLogsChunked(client, marketAddress, STAKE_PLACED_EVENT, fromBlock, latestBlock),
      getLogsChunked(client, marketAddress, MARKET_RESOLVED_EVENT, fromBlock, latestBlock),
    ]);

    const markets = new Map<string, MarketAggregate>();
    for (const log of createdLogs) {
      const key = String(log.args.proposalKey);
      if (!key) continue;
      if (!markets.has(key)) {
        markets.set(key, {
          key,
          dao: String(log.args.dao || "unknown"),
          proposalId: String(log.args.proposalId || ""),
          stakesByUser: new Map<string, StakeSide>(),
        });
      }
    }

    for (const log of stakeLogs) {
      const key = String(log.args.proposalKey);
      const staker = String(log.args.staker || "").toLowerCase() as Address;
      const amount = BigInt(log.args.amount || BIGINT_ZERO);
      const isFor = Boolean(log.args.isFor);
      if (!key || !staker || amount <= BIGINT_ZERO) continue;

      const market = markets.get(key) || {
        key,
        dao: "unknown",
        proposalId: "",
        stakesByUser: new Map<string, StakeSide>(),
      };

      const existing = market.stakesByUser.get(staker) || { forStake: BIGINT_ZERO, againstStake: BIGINT_ZERO };
      if (isFor) existing.forStake += amount;
      else existing.againstStake += amount;
      market.stakesByUser.set(staker, existing);
      markets.set(key, market);
    }

    for (const log of resolvedLogs) {
      const key = String(log.args.proposalKey);
      const outcome = Number(log.args.outcome || 0);
      const market = markets.get(key) || {
        key,
        dao: "unknown",
        proposalId: "",
        stakesByUser: new Map<string, StakeSide>(),
      };
      market.outcome = outcome;
      markets.set(key, market);
    }

    const analystMap = new Map<string, AnalystAggregate>();
    let resolvedMarkets = 0;

    for (const market of markets.values()) {
      if (market.outcome !== OUTCOME_FOR && market.outcome !== OUTCOME_AGAINST) continue;
      if (market.stakesByUser.size === 0) continue;
      resolvedMarkets++;

      for (const [address, stake] of market.stakesByUser.entries()) {
        const total = stake.forStake + stake.againstStake;
        if (total <= BIGINT_ZERO) continue;

        // If user staked both sides equally, it carries no directional signal.
        if (stake.forStake === stake.againstStake) continue;

        const predictedOutcome = stake.forStake > stake.againstStake ? OUTCOME_FOR : OUTCOME_AGAINST;
        const dominantStake = stake.forStake > stake.againstStake ? stake.forStake : stake.againstStake;
        const wasCorrect = predictedOutcome === market.outcome;
        const confidence = Number(dominantStake) / Number(total);

        const analyst = analystMap.get(address) || {
          address: address as Address,
          totalPredictions: 0,
          correctPredictions: 0,
          incorrectPredictions: 0,
          confidenceSum: 0,
          dominantStakeWei: BIGINT_ZERO,
          netSignalWei: BIGINT_ZERO,
          daoStats: new Map<string, DaoAccuracy>(),
        };

        analyst.totalPredictions += 1;
        analyst.correctPredictions += wasCorrect ? 1 : 0;
        analyst.incorrectPredictions += wasCorrect ? 0 : 1;
        analyst.confidenceSum += confidence;
        analyst.dominantStakeWei += dominantStake;
        analyst.netSignalWei += wasCorrect ? dominantStake : -dominantStake;

        const daoKey = market.dao.toLowerCase() || "unknown";
        const dao = analyst.daoStats.get(daoKey) || { total: 0, correct: 0, stakeWei: BIGINT_ZERO };
        dao.total += 1;
        dao.correct += wasCorrect ? 1 : 0;
        dao.stakeWei += dominantStake;
        analyst.daoStats.set(daoKey, dao);

        analystMap.set(address, analyst);
      }
    }

    const filtered = Array.from(analystMap.values()).filter(
      (analyst) => analyst.totalPredictions >= minPredictions
    );

    let maxInfluenceRaw = 0;
    const influenceRawByAddress = new Map<string, number>();
    for (const analyst of filtered) {
      const raw = Math.log10(1 + toEth(analyst.dominantStakeWei));
      influenceRawByAddress.set(analyst.address.toLowerCase(), raw);
      if (raw > maxInfluenceRaw) maxInfluenceRaw = raw;
    }

    const analysts: AnalystReputation[] = filtered
      .map((analyst) => {
        const accuracy = analyst.totalPredictions > 0
          ? analyst.correctPredictions / analyst.totalPredictions
          : 0;
        const avgConfidence = analyst.totalPredictions > 0
          ? analyst.confidenceSum / analyst.totalPredictions
          : 0;
        const influenceRaw = influenceRawByAddress.get(analyst.address.toLowerCase()) || 0;
        const influence = maxInfluenceRaw > 0 ? influenceRaw / maxInfluenceRaw : 0;

        // Interpretation score proxy: confidence with a light reward for consistency.
        const consistency = 1 - Math.min(1, Math.abs(0.5 - accuracy) * 2);
        const interpretation = clamp01((avgConfidence * 0.7) + (consistency * 0.3));
        const credibility = clamp01((accuracy * 0.65) + (influence * 0.2) + (interpretation * 0.15));

        const topicExpertise = Array.from(analyst.daoStats.entries())
          .map(([topic, stats]) => ({
            topic,
            predictions: stats.total,
            accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
            stakeWei: stats.stakeWei,
          }))
          .sort((a, b) => {
            if (b.predictions !== a.predictions) return b.predictions - a.predictions;
            return Number(b.stakeWei - a.stakeWei);
          })
          .slice(0, 4)
          .map((entry) => ({
            topic: entry.topic,
            predictions: entry.predictions,
            accuracy: toPct(entry.accuracy),
          }));

        return {
          address: analyst.address,
          totalPredictions: analyst.totalPredictions,
          correctPredictions: analyst.correctPredictions,
          incorrectPredictions: analyst.incorrectPredictions,
          predictionAccuracy: toPct(accuracy),
          averageConfidence: toPct(avgConfidence),
          influenceScore: toPct(influence),
          interpretationScore: toPct(interpretation),
          credibilityScore: toPct(credibility),
          totalStakedEth: Number(toEth(analyst.dominantStakeWei).toFixed(4)),
          netSignalEth: Number(toEth(analyst.netSignalWei).toFixed(4)),
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
        return b.totalStakedEth - a.totalStakedEth;
      })
      .slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      marketAddress,
      scannedFromBlock: fromBlock.toString(),
      scannedToBlock: latestBlock.toString(),
      resolvedMarkets,
      analysts,
    };
  } catch (error) {
    console.error("[analyst-reputation] failed to compute", error);
    return empty;
  }
}
