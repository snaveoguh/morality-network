// ─── Prediction Market Utilities ────────────────────────────────────────────

export enum MarketOutcome {
  Unresolved = 0,
  For = 1,
  Against = 2,
  Void = 3,
}

export interface ParsedMarketData {
  forPool: bigint;
  againstPool: bigint;
  forStakers: number;
  againstStakers: number;
  forOddsBps: number;
  againstOddsBps: number;
  outcome: MarketOutcome;
  exists: boolean;
  totalPool: bigint;
  forPercent: number;
  againstPercent: number;
}

export interface ParsedPosition {
  forStake: bigint;
  againstStake: bigint;
  claimed: boolean;
  totalStake: bigint;
  side: "for" | "against" | "both" | "none";
}

export function parseMarketData(
  raw: readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean],
): ParsedMarketData {
  const [forPool, againstPool, forStakers, againstStakers, forOddsBps, againstOddsBps, outcome, exists] = raw;
  const totalPool = forPool + againstPool;
  const forPercent =
    totalPool > BigInt(0)
      ? Number((forPool * BigInt(10000)) / totalPool) / 100
      : 50;
  const againstPercent = totalPool > BigInt(0) ? 100 - forPercent : 50;

  return {
    forPool,
    againstPool,
    forStakers: Number(forStakers),
    againstStakers: Number(againstStakers),
    forOddsBps: Number(forOddsBps),
    againstOddsBps: Number(againstOddsBps),
    outcome: outcome as MarketOutcome,
    exists,
    totalPool,
    forPercent,
    againstPercent,
  };
}

export function parsePosition(raw: readonly [bigint, bigint, boolean]): ParsedPosition {
  const [forStake, againstStake, claimed] = raw;
  const totalStake = forStake + againstStake;
  let side: ParsedPosition["side"] = "none";
  if (forStake > BigInt(0) && againstStake > BigInt(0)) side = "both";
  else if (forStake > BigInt(0)) side = "for";
  else if (againstStake > BigInt(0)) side = "against";

  return { forStake, againstStake, claimed, totalStake, side };
}

export function calculatePotentialPayout(
  stakeWei: bigint,
  isFor: boolean,
  market: ParsedMarketData,
): bigint {
  if (market.totalPool === BigInt(0)) return stakeWei * BigInt(2);

  const myPool = isFor ? market.forPool : market.againstPool;
  const otherPool = isFor ? market.againstPool : market.forPool;
  const newMyPool = myPool + stakeWei;
  const totalAfter = newMyPool + otherPool;

  if (newMyPool === BigInt(0)) return BigInt(0);
  return (stakeWei * totalAfter) / newMyPool;
}

export function formatOdds(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
