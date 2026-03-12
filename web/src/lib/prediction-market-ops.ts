import "server-only";

import type { Address } from "viem";
import {
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_ADDRESS,
} from "./contracts";
import {
  fetchLilNounsProposals,
  fetchNounsProposals,
  type NounsProposal,
} from "./nouns";
import { predictionMarketPublicClient } from "./server/onchain-clients";

type PredictionDaoKey = "nouns" | "lil-nouns";
type PredictionOpsAction =
  | "create-market"
  | "resolve-market"
  | "watch-market"
  | "resolved"
  | "skip";

interface RawMarketData {
  forPool: bigint;
  againstPool: bigint;
  forStakers: bigint;
  againstStakers: bigint;
  forOddsBps: bigint;
  againstOddsBps: bigint;
  outcome: number;
  exists: boolean;
}

export interface PredictionMarketOpsEntry {
  daoKey: PredictionDaoKey;
  daoLabel: string;
  proposalId: string;
  title: string;
  status: string;
  link: string;
  resolverConfigured: boolean;
  marketExists: boolean;
  outcome: number;
  outcomeLabel: string;
  totalPoolWei: string;
  operatorAction: PredictionOpsAction;
  note: string;
}

export interface PredictionMarketOpsSnapshot {
  generatedAt: string;
  marketAddress: Address;
  totals: {
    proposalsScanned: number;
    createMarket: number;
    resolveMarket: number;
    watchMarket: number;
    resolved: number;
    skipped: number;
  };
  entries: PredictionMarketOpsEntry[];
}

const STAKEABLE_STATUSES = new Set(["Pending", "Active", "ObjectionPeriod", "Updatable"]);
const TERMINAL_STATUSES = new Set([
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
  "Vetoed",
]);

function toDaoKey(dao: NounsProposal["dao"]): PredictionDaoKey {
  return dao === "lilnouns" ? "lil-nouns" : "nouns";
}

function toDaoLabel(daoKey: PredictionDaoKey): string {
  return daoKey === "lil-nouns" ? "Lil Nouns" : "Nouns DAO";
}

function toProposalLink(proposal: NounsProposal): string {
  return proposal.dao === "lilnouns"
    ? `https://lilnouns.wtf/vote/${proposal.id}`
    : `https://nouns.wtf/vote/${proposal.id}`;
}

function toOutcomeLabel(outcome: number): string {
  switch (outcome) {
    case 1:
      return "for";
    case 2:
      return "against";
    case 3:
      return "void";
    default:
      return "unresolved";
  }
}

function actionPriority(action: PredictionOpsAction): number {
  switch (action) {
    case "resolve-market":
      return 0;
    case "create-market":
      return 1;
    case "watch-market":
      return 2;
    case "resolved":
      return 3;
    default:
      return 4;
  }
}

function toRawMarketData(
  raw: readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean],
): RawMarketData {
  const [
    forPool,
    againstPool,
    forStakers,
    againstStakers,
    forOddsBps,
    againstOddsBps,
    outcome,
    exists,
  ] = raw;

  return {
    forPool,
    againstPool,
    forStakers,
    againstStakers,
    forOddsBps,
    againstOddsBps,
    outcome,
    exists,
  };
}

function summarizeAction(params: {
  resolverConfigured: boolean;
  marketExists: boolean;
  outcome: number;
  status: string;
}): { operatorAction: PredictionOpsAction; note: string } {
  const { resolverConfigured, marketExists, outcome, status } = params;

  if (!resolverConfigured) {
    return {
      operatorAction: "skip",
      note: "Resolver not configured on the Ethereum market contract.",
    };
  }

  if (!marketExists) {
    if (STAKEABLE_STATUSES.has(status)) {
      return {
        operatorAction: "create-market",
        note: "Proposal is live and needs createMarket() before users can stake.",
      };
    }

    return {
      operatorAction: "skip",
      note: "Proposal is not open and no market exists to manage.",
    };
  }

  if (outcome === 0 && TERMINAL_STATUSES.has(status)) {
    return {
      operatorAction: "resolve-market",
      note: "Proposal reached a terminal governor state and can be resolved now.",
    };
  }

  if (outcome === 0) {
    return {
      operatorAction: "watch-market",
      note: "Market exists and remains open while the proposal is live.",
    };
  }

  return {
    operatorAction: "resolved",
    note: "Market is already resolved onchain.",
  };
}

export async function buildPredictionMarketOpsSnapshot(options?: {
  limit?: number;
}): Promise<PredictionMarketOpsSnapshot> {
  const limit = Math.max(1, Math.min(50, options?.limit ?? 12));

  const [nouns, lilNouns, nounsResolvable, lilNounsResolvable] = await Promise.all([
    fetchNounsProposals(limit),
    fetchLilNounsProposals(limit),
    predictionMarketPublicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "isDaoResolvable",
      args: ["nouns"],
    }),
    predictionMarketPublicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "isDaoResolvable",
      args: ["lil-nouns"],
    }),
  ]);

  const resolvableByDao: Record<PredictionDaoKey, boolean> = {
    nouns: nounsResolvable === true,
    "lil-nouns": lilNounsResolvable === true,
  };

  const proposals = [...nouns, ...lilNouns];
  const entries = await Promise.all(
    proposals.map(async (proposal) => {
      const daoKey = toDaoKey(proposal.dao);
      const proposalId = String(proposal.id);
      const rawMarket = toRawMarketData(
        (await predictionMarketPublicClient.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: "getMarket",
          args: [daoKey, proposalId],
        })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean],
      );
      const operatorState = summarizeAction({
        resolverConfigured: resolvableByDao[daoKey],
        marketExists: rawMarket.exists,
        outcome: rawMarket.outcome,
        status: proposal.status,
      });

      return {
        daoKey,
        daoLabel: toDaoLabel(daoKey),
        proposalId,
        title: proposal.title,
        status: proposal.status,
        link: toProposalLink(proposal),
        resolverConfigured: resolvableByDao[daoKey],
        marketExists: rawMarket.exists,
        outcome: rawMarket.outcome,
        outcomeLabel: toOutcomeLabel(rawMarket.outcome),
        totalPoolWei: (rawMarket.forPool + rawMarket.againstPool).toString(),
        operatorAction: operatorState.operatorAction,
        note: operatorState.note,
      } satisfies PredictionMarketOpsEntry;
    }),
  );

  entries.sort((left, right) => {
    const actionDelta = actionPriority(left.operatorAction) - actionPriority(right.operatorAction);
    if (actionDelta !== 0) return actionDelta;

    return Number(right.proposalId) - Number(left.proposalId);
  });

  const totals = entries.reduce(
    (acc, entry) => {
      switch (entry.operatorAction) {
        case "create-market":
          acc.createMarket += 1;
          break;
        case "resolve-market":
          acc.resolveMarket += 1;
          break;
        case "watch-market":
          acc.watchMarket += 1;
          break;
        case "resolved":
          acc.resolved += 1;
          break;
        default:
          acc.skipped += 1;
          break;
      }
      return acc;
    },
    {
      proposalsScanned: entries.length,
      createMarket: 0,
      resolveMarket: 0,
      watchMarket: 0,
      resolved: 0,
      skipped: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    marketAddress: PREDICTION_MARKET_ADDRESS,
    totals,
    entries,
  };
}
