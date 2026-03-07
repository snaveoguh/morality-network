import { getPublicClient } from '../shared/rpc';
import { CONTRACTS, RATINGS_ABI, COMMENTS_ABI, TIPPING_ABI, LEADERBOARD_ABI } from '../shared/contracts';
import { computeEntityHashCandidates } from '../shared/entity';
import { getSourceBias, type SourceBias } from '../shared/bias';
import { get, set } from './cache';
import type { EntityData, CommentData, BiasInfo } from '../shared/types';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

function isDeployed(): boolean {
  return CONTRACTS.ratings !== ZERO_ADDR;
}

function sourceBiasToInfo(sb: SourceBias): BiasInfo {
  return {
    name: sb.name,
    bias: sb.bias,
    factuality: sb.factuality,
    ownership: sb.ownership,
    country: sb.country,
    fundingModel: sb.fundingModel,
  };
}

export async function fetchEntityData(identifier: string): Promise<EntityData> {
  const entityHashes = computeEntityHashCandidates(identifier);
  const primaryEntityHash = entityHashes[0];
  const cacheKey = `entity:${primaryEntityHash}`;
  const cached = get<EntityData>(cacheKey);
  if (cached) return cached;

  // Check bias database
  let bias: BiasInfo | null = null;
  const sb = getSourceBias(identifier);
  if (sb) bias = sourceBiasToInfo(sb);

  // If contracts aren't deployed, return empty data with bias only
  if (!isDeployed()) {
    const data: EntityData = {
      entityHash: primaryEntityHash,
      identifier,
      compositeScore: 0,
      avgRating: 0,
      ratingCount: 0,
      commentCount: 0,
      tipTotal: '0',
      bias,
    };
    set(cacheKey, data);
    return data;
  }

  try {
    const client = getPublicClient();

    const perHashStats = await Promise.all(
      entityHashes.map(async (entityHash) => {
        const results = await client.multicall({
          contracts: [
            { address: CONTRACTS.leaderboard, abi: LEADERBOARD_ABI, functionName: 'getCompositeScore', args: [entityHash] },
            { address: CONTRACTS.ratings, abi: RATINGS_ABI, functionName: 'getAverageRating', args: [entityHash] },
            { address: CONTRACTS.comments, abi: COMMENTS_ABI, functionName: 'getEntityCommentCount', args: [entityHash] },
            { address: CONTRACTS.tipping, abi: TIPPING_ABI, functionName: 'entityTipTotals', args: [entityHash] },
          ],
        });

        const compositeScore = results[0].status === 'success' ? Number(results[0].result) : 0;
        const ratingResult = results[1].status === 'success' ? (results[1].result as [bigint, bigint]) : [0n, 0n];
        const commentCount = results[2].status === 'success' ? Number(results[2].result) : 0;
        const tipTotal = results[3].status === 'success' ? BigInt(results[3].result as bigint) : 0n;

        return {
          compositeScore,
          avgRating: Number(ratingResult[0]),
          ratingCount: Number(ratingResult[1]),
          commentCount,
          tipTotal,
        };
      }),
    );

    let compositeScore = 0;
    let ratingCount = 0;
    let weightedRatingTotal = 0;
    let commentCount = 0;
    let tipTotal = 0n;

    for (const stats of perHashStats) {
      compositeScore = Math.max(compositeScore, stats.compositeScore);
      ratingCount += stats.ratingCount;
      weightedRatingTotal += stats.avgRating * stats.ratingCount;
      commentCount += stats.commentCount;
      tipTotal += stats.tipTotal;
    }

    const avgRating =
      ratingCount > 0 ? Math.round(weightedRatingTotal / ratingCount) : 0;

    const data: EntityData = {
      entityHash: primaryEntityHash,
      identifier,
      compositeScore,
      avgRating,
      ratingCount,
      commentCount,
      tipTotal: tipTotal.toString(),
      bias,
    };

    set(cacheKey, data);
    return data;
  } catch (err) {
    console.error('RPC error fetching entity data:', err);
    return {
      entityHash: primaryEntityHash,
      identifier,
      compositeScore: 0,
      avgRating: 0,
      ratingCount: 0,
      commentCount: 0,
      tipTotal: '0',
      bias,
    };
  }
}

export async function fetchComments(entityHash: string, offset: number, limit: number): Promise<CommentData[]> {
  if (!isDeployed()) return [];

  try {
    const client = getPublicClient();
    const hash = entityHash as `0x${string}`;

    const commentIds = await client.readContract({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: 'getEntityComments',
      args: [hash, BigInt(offset), BigInt(limit)],
    }) as bigint[];

    if (!commentIds.length) return [];

    // Batch fetch all comments
    const commentCalls = commentIds.map(id => ({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: 'getComment' as const,
      args: [id],
    }));

    const results = await client.multicall({ contracts: commentCalls });

    return results
      .filter(r => r.status === 'success')
      .map(r => {
        const c = r.result as unknown as [bigint, `0x${string}`, `0x${string}`, string, bigint, bigint, bigint, bigint, boolean];
        return {
          id: Number(c[0]),
          author: c[2],
          content: c[3],
          parentId: Number(c[4]),
          score: Number(c[5]),
          tipTotal: String(c[6]),
          timestamp: Number(c[7]),
        };
      });
  } catch (err) {
    console.error('RPC error fetching comments:', err);
    return [];
  }
}
