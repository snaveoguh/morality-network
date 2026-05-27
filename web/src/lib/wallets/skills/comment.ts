import { encodeFunctionData, isHex, type Address } from "viem";
import type { SkillContext, SkillHandler, SkillResult } from "./types";

// MoralityComments (Base mainnet) — public, no allowlist.
const MORALITY_COMMENTS: Address = "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b";

const COMMENT_ABI = [
  {
    type: "function",
    name: "comment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "content", type: "string" },
      { name: "parentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface CommentParams {
  /** bytes32 hash of the entity being discussed (article, market, peer, etc). */
  entityHash: `0x${string}`;
  /** Up to ~2000 chars; longer content will be truncated by callers. */
  content: string;
  /** 0 = top-level; otherwise the commentId being replied to. */
  parentId: bigint;
}

function requireBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  throw new Error(`${name} must be a non-negative integer or numeric string`);
}

export const commentSkill: SkillHandler<CommentParams> = {
  name: "comment",

  parse(raw): CommentParams {
    if (!raw || typeof raw !== "object") throw new Error("comment params must be an object");
    const r = raw as Record<string, unknown>;
    if (
      typeof r.entityHash !== "string" ||
      !isHex(r.entityHash) ||
      r.entityHash.length !== 66
    ) {
      throw new Error("entityHash must be a 0x-prefixed bytes32");
    }
    if (typeof r.content !== "string" || r.content.length === 0) {
      throw new Error("content must be a non-empty string");
    }
    const content = r.content.slice(0, 2000);
    const parentId = r.parentId === undefined ? BigInt(0) : requireBigInt(r.parentId, "parentId");
    return {
      entityHash: r.entityHash as `0x${string}`,
      content,
      parentId,
    };
  },

  async run(ctx: SkillContext, params: CommentParams): Promise<SkillResult> {
    const data = encodeFunctionData({
      abi: COMMENT_ABI,
      functionName: "comment",
      args: [params.entityHash, params.content, params.parentId],
    });
    const txHash = await ctx.wallet.sendTx({
      to: MORALITY_COMMENTS,
      data,
      value: BigInt(0),
    });
    return {
      txHash,
      meta: {
        entityHash: params.entityHash,
        parentId: params.parentId.toString(),
        contentLength: params.content.length,
      },
    };
  },
};

export const MORALITY_COMMENTS_ADDRESS = MORALITY_COMMENTS;
