import { createPublicClient, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import { COMMENTS_ABI, CONTRACTS } from "./contracts";

const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ||
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
  "https://sepolia.base.org";

const commentsClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC_URL, { timeout: 10_000 }),
});

const TIP_LOG_LOOKBACK_BLOCKS = BigInt(12_000);
const TIP_LOG_CHUNK_SIZE = BigInt(10_000);

const TIP_SENT_EVENT = parseAbiItem(
  "event TipSent(bytes32 indexed entityHash, address indexed tipper, address indexed recipient, uint256 amount)"
);
const COMMENT_TIPPED_EVENT = parseAbiItem(
  "event CommentTipped(uint256 indexed commentId, address indexed tipper, address indexed author, uint256 amount)"
);

export interface ProtocolComment {
  id: bigint;
  entityHash: `0x${string}`;
  author: `0x${string}`;
  content: string;
  parentId: bigint;
  score: bigint;
  tipTotal: bigint;
  timestamp: bigint;
}

export interface ProtocolTipActivity {
  kind: "tip";
  id: string;
  timestamp: bigint;
  tipper: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  tipType: "entity" | "comment";
  entityHash?: `0x${string}`;
  commentId?: bigint;
}

export interface ProtocolCommentActivity extends ProtocolComment {
  kind: "comment";
}

export type ProtocolActivity = ProtocolCommentActivity | ProtocolTipActivity;

interface BaseTipLog {
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
}

interface TipSentLog extends BaseTipLog {
  eventName: "TipSent";
  args: {
    entityHash: `0x${string}`;
    tipper: `0x${string}`;
    recipient: `0x${string}`;
    amount: bigint;
  };
}

interface CommentTippedLog extends BaseTipLog {
  eventName: "CommentTipped";
  args: {
    commentId: bigint;
    tipper: `0x${string}`;
    author: `0x${string}`;
    amount: bigint;
  };
}

type ParsedTipLog = TipSentLog | CommentTippedLog;

export async function fetchProtocolWideComments(limit = 24): Promise<ProtocolComment[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  try {
    const nextCommentId = await commentsClient.readContract({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "nextCommentId",
    });

    if (nextCommentId <= BigInt(1)) {
      return [];
    }

    const maxCommentId = nextCommentId - BigInt(1);
    const startCommentId =
      maxCommentId > BigInt(safeLimit - 1)
        ? maxCommentId - BigInt(safeLimit - 1)
        : BigInt(1);

    const commentIds: bigint[] = [];
    for (let commentId = maxCommentId; commentId >= startCommentId; commentId--) {
      commentIds.push(commentId);
      if (commentId === BigInt(1)) {
        break;
      }
    }

    const comments = await Promise.all(
      commentIds.map((commentId) =>
        commentsClient.readContract({
          address: CONTRACTS.comments,
          abi: COMMENTS_ABI,
          functionName: "getComment",
          args: [commentId],
        })
      )
    );

    return comments
      .filter((comment) => comment.exists)
      .map((comment) => ({
        id: comment.id,
        entityHash: comment.entityHash as `0x${string}`,
        author: comment.author as `0x${string}`,
        content: comment.content,
        parentId: comment.parentId,
        score: comment.score,
        tipTotal: comment.tipTotal,
        timestamp: comment.timestamp,
      }));
  } catch (error) {
    console.error("[LiveComments] Failed to fetch protocol-wide comments:", error);
    return [];
  }
}

export async function fetchProtocolWireActivity(limit = 24): Promise<ProtocolActivity[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const expandedLimit = Math.min(safeLimit * 2, 100);

  const [comments, tips] = await Promise.all([
    fetchProtocolWideComments(expandedLimit),
    fetchRecentTips(expandedLimit),
  ]);

  const commentActivities: ProtocolCommentActivity[] = comments.map((comment) => ({
    ...comment,
    kind: "comment",
  }));

  const merged: ProtocolActivity[] = [...commentActivities, ...tips];
  merged.sort((a, b) => {
    if (a.timestamp === b.timestamp) return 0;
    return a.timestamp > b.timestamp ? -1 : 1;
  });

  return merged.slice(0, safeLimit);
}

async function fetchRecentTips(limit = 24): Promise<ProtocolTipActivity[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  try {
    const latestBlock = await commentsClient.getBlockNumber();
    const fromBlock =
      latestBlock > TIP_LOG_LOOKBACK_BLOCKS
        ? latestBlock - TIP_LOG_LOOKBACK_BLOCKS
        : BigInt(0);

    const logs = await getTipLogsChunked(fromBlock, latestBlock);
    if (logs.length === 0) return [];

    const recentLogs = logs
      .slice()
      .sort((a, b) => {
        const blockA = a.blockNumber ?? BigInt(0);
        const blockB = b.blockNumber ?? BigInt(0);
        if (blockA !== blockB) return blockA > blockB ? -1 : 1;
        const indexA = a.logIndex ?? 0;
        const indexB = b.logIndex ?? 0;
        return indexA > indexB ? -1 : 1;
      })
      .slice(0, safeLimit * 2);

    const uniqueBlocks = Array.from(
      new Set(
        recentLogs
          .map((log) => log.blockNumber)
          .filter((blockNumber): blockNumber is bigint => blockNumber !== null)
      )
    );
    const blockTimestampMap = new Map<bigint, bigint>();
    await Promise.all(
      uniqueBlocks.map(async (blockNumber) => {
        const block = await commentsClient.getBlock({ blockNumber });
        blockTimestampMap.set(blockNumber, block.timestamp);
      })
    );

    const tippedCommentIds = new Set<bigint>();
    for (const log of recentLogs) {
      if (log.eventName === "CommentTipped") {
        tippedCommentIds.add(log.args.commentId);
      }
    }

    const commentEntityMap = new Map<bigint, `0x${string}`>();
    if (tippedCommentIds.size > 0) {
      await Promise.all(
        Array.from(tippedCommentIds).map(async (commentId) => {
          try {
            const comment = await commentsClient.readContract({
              address: CONTRACTS.comments,
              abi: COMMENTS_ABI,
              functionName: "getComment",
              args: [commentId],
            });
            if (comment.exists) {
              commentEntityMap.set(commentId, comment.entityHash as `0x${string}`);
            }
          } catch {
            // Skip stale/missing comments for tip events.
          }
        })
      );
    }

    const tipActivities: ProtocolTipActivity[] = recentLogs.map((log) => {
      const ts =
        log.blockNumber !== null
          ? (blockTimestampMap.get(log.blockNumber) ?? BigInt(0))
          : BigInt(0);
      const txHash = log.transactionHash ?? "0x0";
      const logIndex =
        log.logIndex !== null && log.logIndex !== undefined
          ? log.logIndex.toString()
          : "0";

      if (log.eventName === "TipSent") {
        return {
          kind: "tip",
          id: `${txHash}-${logIndex}-entity`,
          timestamp: ts,
          tipper: log.args.tipper,
          recipient: log.args.recipient,
          amount: log.args.amount,
          tipType: "entity",
          entityHash: log.args.entityHash as `0x${string}`,
        };
      }

      const entityHash = commentEntityMap.get(log.args.commentId);
      return {
        kind: "tip",
        id: `${txHash}-${logIndex}-comment`,
        timestamp: ts,
        tipper: log.args.tipper,
        recipient: log.args.author,
        amount: log.args.amount,
        tipType: "comment",
        commentId: log.args.commentId,
        entityHash,
      };
    });

    tipActivities.sort((a, b) => {
      if (a.timestamp === b.timestamp) return 0;
      return a.timestamp > b.timestamp ? -1 : 1;
    });

    return tipActivities.slice(0, safeLimit);
  } catch (error) {
    console.error("[LiveComments] Failed to fetch recent tip activity:", error);
    return [];
  }
}

async function getTipLogsChunked(fromBlock: bigint, toBlock: bigint): Promise<ParsedTipLog[]> {
  const logs: ParsedTipLog[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const chunkEnd =
      cursor + TIP_LOG_CHUNK_SIZE - BigInt(1) > toBlock
        ? toBlock
        : cursor + TIP_LOG_CHUNK_SIZE - BigInt(1);

    const chunkLogs = (await commentsClient.getLogs({
      address: CONTRACTS.tipping,
      events: [TIP_SENT_EVENT, COMMENT_TIPPED_EVENT],
      fromBlock: cursor,
      toBlock: chunkEnd,
    })) as ParsedTipLog[];

    logs.push(...chunkLogs);
    cursor = chunkEnd + BigInt(1);
  }

  return logs;
}
