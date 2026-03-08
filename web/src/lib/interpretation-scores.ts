import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { COMMENTS_ABI, CONTRACTS, PREDICTION_MARKET_ADDRESS } from "./contracts";
import { computeEntityHash } from "./entity";

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

const COMMENT_CREATED_EVENT = parseAbiItem(
  "event CommentCreated(uint256 indexed commentId, bytes32 indexed entityHash, address indexed author, uint256 parentId)"
);

const OUTCOME_FOR = 1;
const OUTCOME_AGAINST = 2;

type BinaryOutcome = "for" | "against";

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
  candidateEntityHashes: Set<`0x${string}`>;
}

interface CommentCandidate {
  commentId: bigint;
  entityHash: `0x${string}`;
  author: Address;
  parentId: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface InterpretationOutcomeScore {
  id: string;
  proposalKey: string;
  dao: string;
  proposalId: string;
  entityHash: `0x${string}`;
  commentId: string;
  author: Address;
  parentId: string;
  argumentType: "discussion" | "claim" | "counterclaim" | "evidence" | "source";
  interpretation: string;
  predictedOutcome: BinaryOutcome;
  resolvedOutcome: BinaryOutcome;
  wasCorrect: boolean;
  confidence: number;
  stakeEth: number;
  commentScore: number;
  tipEth: number;
  outcomeScore: number;
  createdAt: string;
  txHash: `0x${string}`;
}

export interface InterpretationOutcomeSnapshot {
  generatedAt: string;
  marketAddress: Address;
  commentsAddress: Address;
  scannedFromBlock: string;
  scannedToBlock: string;
  resolvedMarkets: number;
  candidateComments: number;
  scoredInterpretations: number;
  interpretations: InterpretationOutcomeScore[];
}

function getRpcUrl(): string {
  return (
    process.env.BASE_SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

function round(value: number, precision = 3): number {
  const base = 10 ** precision;
  return Math.round(value * base) / base;
}

function normalizeDao(dao: string): string {
  return dao.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function buildProposalEntityHashes(dao: string, proposalId: string): Set<`0x${string}`> {
  const normalized = normalizeDao(dao);
  const raw = dao.trim().toLowerCase();
  const pid = proposalId.trim();

  const candidates = new Set<string>([
    `${raw}:${pid}`,
    `${normalized}:${pid}`,
    `proposal:${raw}:${pid}`,
    `proposal:${normalized}:${pid}`,
    `${raw}-${pid}`,
    `${normalized}-${pid}`,
    `${raw}/${pid}`,
    `${normalized}/${pid}`,
    `proposals/${raw}/${pid}`,
    `proposals/${normalized}/${pid}`,
  ]);

  if (raw.includes("nouns") || normalized.includes("nouns")) {
    candidates.add(`nouns:${pid}`);
    candidates.add(`nouns-${pid}`);
    candidates.add(`proposal:nouns:${pid}`);
    candidates.add(`proposal:nouns-${pid}`);
  }

  const hashes = new Set<`0x${string}`>();
  for (const identifier of candidates) {
    hashes.add(computeEntityHash(identifier));
  }

  return hashes;
}

function toArgumentType(argumentType: number):
  | "discussion"
  | "claim"
  | "counterclaim"
  | "evidence"
  | "source" {
  switch (argumentType) {
    case 1:
      return "claim";
    case 2:
      return "counterclaim";
    case 3:
      return "evidence";
    case 4:
      return "source";
    default:
      return "discussion";
  }
}

async function getLogsChunked(
  client: any,
  params: {
    address: Address;
    event: any;
    fromBlock: bigint;
    toBlock: bigint;
    args?: Record<string, unknown>;
  }
) {
  const logs: any[] = [];
  let start = params.fromBlock;

  while (start <= params.toBlock) {
    const upper = start + LOG_CHUNK_SIZE - BIGINT_ONE;
    const end = upper > params.toBlock ? params.toBlock : upper;

    const chunk = await client.getLogs({
      address: params.address,
      event: params.event,
      fromBlock: start,
      toBlock: end,
      args: params.args,
    } as any);

    logs.push(...chunk);
    start = end + BIGINT_ONE;
  }

  return logs;
}

function toBinaryOutcome(outcome: number): BinaryOutcome {
  return outcome === OUTCOME_AGAINST ? "against" : "for";
}

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return fallback;
}

export async function buildInterpretationOutcomeScores(options?: {
  lookbackBlocks?: bigint;
  limit?: number;
  maxCommentCandidates?: number;
  minOutcomeScore?: number;
  onlyCorrect?: boolean;
}): Promise<InterpretationOutcomeSnapshot> {
  const marketAddress = PREDICTION_MARKET_ADDRESS;
  const commentsAddress = CONTRACTS.comments;
  const limit = Math.max(1, Math.min(200, options?.limit ?? 40));
  const lookbackBlocks = options?.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  const maxCommentCandidates = Math.max(limit, Math.min(1200, options?.maxCommentCandidates ?? limit * 20));
  const minOutcomeScore = options?.minOutcomeScore ?? -100;
  const onlyCorrect = options?.onlyCorrect ?? false;

  const empty: InterpretationOutcomeSnapshot = {
    generatedAt: new Date().toISOString(),
    marketAddress,
    commentsAddress,
    scannedFromBlock: "0",
    scannedToBlock: "0",
    resolvedMarkets: 0,
    candidateComments: 0,
    scoredInterpretations: 0,
    interpretations: [],
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(marketAddress) || /^0x0+$/.test(marketAddress)) {
    return empty;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(commentsAddress) || /^0x0+$/.test(commentsAddress)) {
    return empty;
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(getRpcUrl()),
  });

  try {
    const latestBlock = await client.getBlockNumber();
    const fromBlock = latestBlock > lookbackBlocks ? latestBlock - lookbackBlocks : BIGINT_ZERO;

    const [createdLogs, stakeLogs, resolvedLogs] = await Promise.all([
      getLogsChunked(client, {
        address: marketAddress,
        event: MARKET_CREATED_EVENT,
        fromBlock,
        toBlock: latestBlock,
      }),
      getLogsChunked(client, {
        address: marketAddress,
        event: STAKE_PLACED_EVENT,
        fromBlock,
        toBlock: latestBlock,
      }),
      getLogsChunked(client, {
        address: marketAddress,
        event: MARKET_RESOLVED_EVENT,
        fromBlock,
        toBlock: latestBlock,
      }),
    ]);

    const markets = new Map<string, MarketAggregate>();

    for (const log of createdLogs) {
      const key = String(log.args.proposalKey);
      if (!key) continue;
      if (!markets.has(key)) {
        const dao = String(log.args.dao || "unknown");
        const proposalId = String(log.args.proposalId || "");
        markets.set(key, {
          key,
          dao,
          proposalId,
          stakesByUser: new Map<string, StakeSide>(),
          candidateEntityHashes: buildProposalEntityHashes(dao, proposalId),
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
        candidateEntityHashes: buildProposalEntityHashes("unknown", ""),
      };

      const current = market.stakesByUser.get(staker) || {
        forStake: BIGINT_ZERO,
        againstStake: BIGINT_ZERO,
      };
      if (isFor) current.forStake += amount;
      else current.againstStake += amount;
      market.stakesByUser.set(staker, current);
      markets.set(key, market);
    }

    for (const log of resolvedLogs) {
      const key = String(log.args.proposalKey);
      const outcome = Number(log.args.outcome || 0);
      const market = markets.get(key);
      if (!market) continue;
      market.outcome = outcome;
    }

    const resolved = [...markets.values()].filter(
      (m) =>
        (m.outcome === OUTCOME_FOR || m.outcome === OUTCOME_AGAINST) &&
        m.stakesByUser.size > 0
    );

    const entityHashToMarketKeys = new Map<`0x${string}`, Set<string>>();
    for (const market of resolved) {
      for (const hash of market.candidateEntityHashes) {
        const current = entityHashToMarketKeys.get(hash) || new Set<string>();
        current.add(market.key);
        entityHashToMarketKeys.set(hash, current);
      }
    }

    const commentCandidates: CommentCandidate[] = [];
    for (const [entityHash] of entityHashToMarketKeys.entries()) {
      const logs = await getLogsChunked(client, {
        address: commentsAddress,
        event: COMMENT_CREATED_EVENT,
        fromBlock,
        toBlock: latestBlock,
        args: { entityHash },
      });

      for (const log of logs) {
        commentCandidates.push({
          commentId: BigInt(log.args.commentId || BIGINT_ZERO),
          entityHash: entityHash,
          author: String(log.args.author || "").toLowerCase() as Address,
          parentId: BigInt(log.args.parentId || BIGINT_ZERO),
          blockNumber: BigInt(log.blockNumber || BIGINT_ZERO),
          txHash: log.transactionHash as `0x${string}`,
        });
      }
    }

    commentCandidates.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    const slicedCandidates = commentCandidates.slice(0, maxCommentCandidates);

    const scored: InterpretationOutcomeScore[] = [];

    for (const candidate of slicedCandidates) {
      const marketKeys = entityHashToMarketKeys.get(candidate.entityHash);
      if (!marketKeys || marketKeys.size === 0) continue;

      let linkedMarket: MarketAggregate | null = null;
      let userStake: StakeSide | null = null;

      for (const key of marketKeys) {
        const market = markets.get(key);
        if (!market || market.outcome == null) continue;
        const stake = market.stakesByUser.get(candidate.author);
        if (!stake) continue;
        if (stake.forStake === stake.againstStake) continue;

        linkedMarket = market;
        userStake = stake;
        break;
      }

      if (!linkedMarket || !userStake || linkedMarket.outcome == null) {
        continue;
      }

      const comment = (await client.readContract({
        address: commentsAddress,
        abi: COMMENTS_ABI,
        functionName: "getComment",
        args: [candidate.commentId],
      })) as any;

      if (!comment || !comment.exists) continue;

      let argumentType: InterpretationOutcomeScore["argumentType"] = "discussion";
      try {
        const meta = (await client.readContract({
          address: commentsAddress,
          abi: COMMENTS_ABI,
          functionName: "getArgumentMeta",
          args: [candidate.commentId],
        })) as readonly [number, bigint, `0x${string}`, boolean];

        if (meta && meta[3]) {
          argumentType = toArgumentType(Number(meta[0]));
        }
      } catch {
        // Older deployments may not expose structured metadata for all comments.
      }

      const forStake = BigInt(userStake.forStake || BIGINT_ZERO);
      const againstStake = BigInt(userStake.againstStake || BIGINT_ZERO);
      const dominantStake = forStake > againstStake ? forStake : againstStake;
      const totalStake = forStake + againstStake;
      if (totalStake <= BIGINT_ZERO) continue;

      const predictedOutcome = forStake > againstStake ? OUTCOME_FOR : OUTCOME_AGAINST;
      const wasCorrect = predictedOutcome === linkedMarket.outcome;
      const confidence = Number(dominantStake) / Number(totalStake);
      const stakeEth = toEth(dominantStake);
      const commentScore = Number(comment.score || 0);
      const tipEth = toEth(BigInt(comment.tipTotal || BIGINT_ZERO));

      const socialComponent = clamp(commentScore, -10, 10) * 1.5 + Math.min(tipEth, 0.2) * 50;
      const accuracyComponent = wasCorrect ? 70 : -70;
      const confidenceComponent = (wasCorrect ? 1 : -1) * confidence * 20;
      const outcomeScore = round(clamp(accuracyComponent + confidenceComponent + socialComponent, -100, 100), 1);

      if (onlyCorrect && !wasCorrect) continue;
      if (outcomeScore < minOutcomeScore) continue;

      scored.push({
        id: `${linkedMarket.key}-${candidate.commentId.toString()}`,
        proposalKey: linkedMarket.key,
        dao: linkedMarket.dao,
        proposalId: linkedMarket.proposalId,
        entityHash: candidate.entityHash,
        commentId: candidate.commentId.toString(),
        author: candidate.author,
        parentId: candidate.parentId.toString(),
        argumentType,
        interpretation: String(comment.content || "").trim(),
        predictedOutcome: toBinaryOutcome(predictedOutcome),
        resolvedOutcome: toBinaryOutcome(linkedMarket.outcome),
        wasCorrect,
        confidence: round(confidence, 4),
        stakeEth: round(stakeEth, 6),
        commentScore,
        tipEth: round(tipEth, 6),
        outcomeScore,
        createdAt: new Date(Number(comment.timestamp || 0) * 1000).toISOString(),
        txHash: candidate.txHash,
      });
    }

    scored.sort((a, b) => {
      if (b.outcomeScore !== a.outcomeScore) return b.outcomeScore - a.outcomeScore;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const interpretations = scored.slice(0, limit);

    return {
      generatedAt: new Date().toISOString(),
      marketAddress,
      commentsAddress,
      scannedFromBlock: fromBlock.toString(),
      scannedToBlock: latestBlock.toString(),
      resolvedMarkets: resolved.length,
      candidateComments: slicedCandidates.length,
      scoredInterpretations: scored.length,
      interpretations,
    };
  } catch (error) {
    console.error("[interpretation-scores] failed", error);
    return empty;
  }
}

export function parseInterpretationScoreQuery(searchParams: URLSearchParams) {
  const limitRaw = Number(searchParams.get("limit") || 40);
  const minScoreRaw = Number(searchParams.get("minOutcomeScore") || -100);
  const lookbackRaw = searchParams.get("lookbackBlocks");

  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
    : 40;

  const minOutcomeScore = Number.isFinite(minScoreRaw)
    ? clamp(minScoreRaw, -100, 100)
    : -100;

  let lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS;
  if (lookbackRaw) {
    try {
      const parsed = BigInt(lookbackRaw);
      lookbackBlocks = parsed < BigInt("5000")
        ? BigInt("5000")
        : parsed > BigInt("5000000")
          ? BigInt("5000000")
          : parsed;
    } catch {
      // fall through to default
    }
  }

  return {
    limit,
    minOutcomeScore,
    lookbackBlocks,
    onlyCorrect: parseBoolParam(searchParams.get("onlyCorrect"), false),
  };
}
