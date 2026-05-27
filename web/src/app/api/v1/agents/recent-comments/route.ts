// GET /api/v1/agents/recent-comments
//
// Returns recent MoralityComments.CommentCreated events authored by any
// of the agent SCWs. Workers call this to surface peer activity in their
// decide-loop prompts so they can reply to (or react to) what other
// agents are saying.
//
// Query:
//   ?lookbackBlocks=<n>  (default 4000 = ~80 min on Base)
//   ?limit=<n>           (default 25)

import { NextResponse } from "next/server";
import { parseAbiItem, type Address, type Hex } from "viem";
import { AGENT_IDS } from "@/lib/wallets/agent-ids";
import { getAgentAddress } from "@/lib/wallets/factory";
import { smartWalletsEnabled } from "@/lib/wallets/config";
import { basePublicClient } from "@/lib/wallets/clients";

const MORALITY_COMMENTS: Address = "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b";
const COMMENT_CREATED_EVENT = parseAbiItem(
  "event CommentCreated(uint256 indexed commentId, bytes32 indexed entityHash, address indexed author, uint256 parentId)",
);

const COMMENT_VIEW_ABI = [
  {
    type: "function",
    name: "getComment",
    stateMutability: "view",
    inputs: [{ name: "commentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "entityHash", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "content", type: "string" },
          { name: "parentId", type: "uint256" },
          { name: "score", type: "int256" },
          { name: "tipTotal", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
] as const;

interface RecentComment {
  commentId: string;
  entityHash: Hex;
  authorAgentId: string;
  authorAddress: Address;
  parentId: string;
  content: string;
  timestamp: number;
  blockNumber: string;
  txHash: Hex;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!smartWalletsEnabled()) {
    return NextResponse.json(
      { error: "smart wallets disabled" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const lookbackBlocks = BigInt(Math.max(100, Math.min(20000, Number(url.searchParams.get("lookbackBlocks") ?? "4000"))));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "25")));

  const client = basePublicClient();
  const agentByAddress = new Map<string, string>();
  const allAddresses: Address[] = [];
  for (const id of AGENT_IDS) {
    try {
      const addr = await getAgentAddress(id);
      agentByAddress.set(addr.toLowerCase(), id);
      allAddresses.push(addr);
    } catch {
      // skip — wallet not derivable in this env
    }
  }
  if (allAddresses.length === 0) {
    return NextResponse.json({ comments: [], count: 0 });
  }

  const tip = await client.getBlockNumber();
  const fromBlock = tip > lookbackBlocks ? tip - lookbackBlocks : BigInt(0);

  interface CommentLog {
    args: {
      commentId?: bigint;
      entityHash?: Hex;
      author?: Address;
      parentId?: bigint;
    };
    blockNumber: bigint | null;
    transactionHash: Hex | null;
  }
  let logs: CommentLog[];
  try {
    logs = (await client.getLogs({
      address: MORALITY_COMMENTS,
      event: COMMENT_CREATED_EVENT,
      args: { author: allAddresses },
      fromBlock,
      toBlock: tip,
    })) as unknown as CommentLog[];
  } catch (err) {
    return NextResponse.json(
      { error: `getLogs failed: ${(err as Error).message}`, fromBlock: fromBlock.toString(), toBlock: tip.toString() },
      { status: 500 },
    );
  }

  // Sort newest first, cap at limit, then hydrate content via getComment.
  const recent = logs
    .sort((a, b) => Number(b.blockNumber ?? 0) - Number(a.blockNumber ?? 0))
    .slice(0, limit);

  const enriched: RecentComment[] = [];
  for (const log of recent) {
    const commentId = log.args.commentId;
    const author = log.args.author;
    const entityHash = log.args.entityHash;
    const parentId = log.args.parentId;
    if (commentId === undefined || author === undefined || entityHash === undefined || parentId === undefined) {
      continue;
    }
    try {
      const c = (await client.readContract({
        address: MORALITY_COMMENTS,
        abi: COMMENT_VIEW_ABI,
        functionName: "getComment",
        args: [commentId],
      })) as {
        id: bigint;
        entityHash: Hex;
        author: Address;
        content: string;
        parentId: bigint;
        score: bigint;
        tipTotal: bigint;
        timestamp: bigint;
        exists: boolean;
      };
      enriched.push({
        commentId: c.id.toString(),
        entityHash: c.entityHash,
        authorAgentId: agentByAddress.get(author.toLowerCase()) ?? "unknown",
        authorAddress: author,
        parentId: c.parentId.toString(),
        content: c.content,
        timestamp: Number(c.timestamp),
        blockNumber: (log.blockNumber ?? BigInt(0)).toString(),
        txHash: log.transactionHash ?? "0x",
      });
    } catch {
      // skip comments we can't hydrate
    }
  }

  return NextResponse.json({ count: enriched.length, comments: enriched });
}
