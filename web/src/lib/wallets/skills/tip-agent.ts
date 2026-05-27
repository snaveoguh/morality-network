import { isAddress, type Address } from "viem";
import { getAgentAddress } from "../factory";
import { isAgentId } from "../agent-ids";
import { transferSkill, type TransferParams } from "./transfer";
import type { SkillContext, SkillHandler, SkillResult } from "./types";

export interface TipAgentParams {
  /** Agent ID from agent-ids.ts. Resolved to the recipient's SCW address. */
  toAgentId: string;
  /** ERC-20 token address; omit for native ETH. */
  token?: Address;
  amount: bigint;
}

function requireBigInt(value: unknown, name: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.floor(value));
  throw new Error(`${name} must be a positive integer or numeric string`);
}

export const tipAgentSkill: SkillHandler<TipAgentParams> = {
  name: "tip-agent",

  parse(raw): TipAgentParams {
    if (!raw || typeof raw !== "object") throw new Error("tip-agent params must be an object");
    const r = raw as Record<string, unknown>;
    if (typeof r.toAgentId !== "string" || !isAgentId(r.toAgentId)) {
      throw new Error("toAgentId must be a known agent id");
    }
    const token =
      r.token === undefined || r.token === null
        ? undefined
        : (typeof r.token === "string" && isAddress(r.token)
          ? (r.token as Address)
          : (() => { throw new Error("token must be an address"); })());
    return {
      toAgentId: r.toAgentId,
      token,
      amount: requireBigInt(r.amount, "amount"),
    };
  },

  async run(ctx: SkillContext, params: TipAgentParams): Promise<SkillResult> {
    if (params.toAgentId === ctx.agentId) {
      throw new Error("cannot tip self");
    }
    const recipient = await getAgentAddress(params.toAgentId);
    const transferParams: TransferParams = {
      token: params.token,
      to: recipient,
      amount: params.amount,
    };
    const result = await transferSkill.run(ctx, transferParams);
    return {
      ...result,
      meta: {
        ...(result.meta ?? {}),
        toAgentId: params.toAgentId,
        recipient,
      },
    };
  },
};
