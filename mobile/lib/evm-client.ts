/**
 * EVM (Base) client — viem public + wallet clients.
 * Port of extension/src/shared/rpc.ts
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type PrivateKeyAccount,
} from 'viem';
import { baseSepolia, base } from 'viem/chains';
import {
  CONTRACTS,
  RATINGS_ABI,
  COMMENTS_ABI,
  TIPPING_ABI,
  LEADERBOARD_ABI,
} from './contracts';
import { computeEntityHashCandidates } from './entity';

// ── Config ──────────────────────────────────────────────────────────

const USE_MAINNET = false; // flip for production
const CHAIN = USE_MAINNET ? base : baseSepolia;
const DEFAULT_RPC = USE_MAINNET
  ? 'https://mainnet.base.org'
  : 'https://sepolia.base.org';

let rpcUrl = DEFAULT_RPC;

export function setRpcUrl(url: string) { rpcUrl = url; }
export function getChainId(): number { return CHAIN.id; }

// ── Clients ─────────────────────────────────────────────────────────

export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: CHAIN,
    transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
    batch: { multicall: true },
  });
}

export function getWalletClient(account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}

// ── Entity data fetching (port of rpc-handler.ts fetchEntityData) ───

export interface EntityData {
  identifier: string;
  entityHash: `0x${string}`;
  compositeScore: number;
  averageRating: number;
  ratingCount: number;
  commentCount: number;
  tipTotal: bigint;
  found: boolean;
}

const entityCache = new Map<string, { data: EntityData; ts: number }>();
const CACHE_TTL = 60_000; // 60s

export async function fetchEntityData(identifier: string): Promise<EntityData> {
  const cached = entityCache.get(identifier);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const client = getPublicClient();
  const hashes = computeEntityHashCandidates(identifier);
  const entityHash = hashes[0];

  try {
    const [score, rating, commentCount, tipTotal] = await Promise.all([
      client.readContract({
        address: CONTRACTS.leaderboard,
        abi: LEADERBOARD_ABI,
        functionName: 'getCompositeScore',
        args: [entityHash],
      }).catch(() => 0n),
      client.readContract({
        address: CONTRACTS.ratings,
        abi: RATINGS_ABI,
        functionName: 'getAverageRating',
        args: [entityHash],
      }).catch(() => [0n, 0n] as readonly [bigint, bigint]),
      client.readContract({
        address: CONTRACTS.comments,
        abi: COMMENTS_ABI,
        functionName: 'getEntityCommentCount',
        args: [entityHash],
      }).catch(() => 0n),
      client.readContract({
        address: CONTRACTS.tipping,
        abi: TIPPING_ABI,
        functionName: 'entityTipTotals',
        args: [entityHash],
      }).catch(() => 0n),
    ]);

    const data: EntityData = {
      identifier,
      entityHash,
      compositeScore: Number(score),
      averageRating: Number((rating as readonly [bigint, bigint])[0]),
      ratingCount: Number((rating as readonly [bigint, bigint])[1]),
      commentCount: Number(commentCount),
      tipTotal: tipTotal as bigint,
      found: Number((rating as readonly [bigint, bigint])[1]) > 0,
    };

    entityCache.set(identifier, { data, ts: Date.now() });
    return data;
  } catch {
    return {
      identifier,
      entityHash,
      compositeScore: 0,
      averageRating: 0,
      ratingCount: 0,
      commentCount: 0,
      tipTotal: 0n,
      found: false,
    };
  }
}

// ── Transaction helpers ─────────────────────────────────────────────

export async function rateEntity(
  account: PrivateKeyAccount,
  entityHash: `0x${string}`,
  score: number,
): Promise<`0x${string}`> {
  const client = getWalletClient(account);
  return client.writeContract({
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: 'rate',
    args: [entityHash, score],
  });
}

export async function submitComment(
  account: PrivateKeyAccount,
  entityHash: `0x${string}`,
  content: string,
  parentId = 0n,
): Promise<`0x${string}`> {
  const client = getWalletClient(account);
  return client.writeContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: 'comment',
    args: [entityHash, content, parentId],
  });
}

export async function tipEntity(
  account: PrivateKeyAccount,
  entityHash: `0x${string}`,
  amountWei: bigint,
): Promise<`0x${string}`> {
  const client = getWalletClient(account);
  return client.writeContract({
    address: CONTRACTS.tipping,
    abi: TIPPING_ABI,
    functionName: 'tipEntity',
    args: [entityHash],
    value: amountWei,
  });
}

export async function getBalance(address: `0x${string}`): Promise<bigint> {
  const client = getPublicClient();
  return client.getBalance({ address });
}
