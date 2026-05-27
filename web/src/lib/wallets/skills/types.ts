import type { Address, Hex } from "viem";
import type { AgentWallet } from "../types";

export interface SkillContext {
  agentId: string;
  wallet: AgentWallet;
}

export interface SkillResult {
  /** Final tx hash (usually the action; approve hashes go in `extraTxHashes`). */
  txHash: Hex;
  /** Extra tx hashes when the skill produced more than one tx (approve, then action). */
  extraTxHashes?: Hex[];
  /** Free-form per-skill output (e.g. amountOut estimate, addresses involved). */
  meta?: Record<string, unknown>;
}

export interface SkillHandler<P> {
  /** Stable name used in the dispatcher (e.g. "swap"). */
  name: string;
  /** Runtime parameter validation. Throws with a clear message on bad input. */
  parse(raw: unknown): P;
  /** Executes the skill via ctx.wallet, returns the action tx hash. */
  run(ctx: SkillContext, params: P): Promise<SkillResult>;
}

export type AnySkill = SkillHandler<unknown>;

// Base mainnet addresses — duplicated here so the wallets module has no
// dependency on web/src/lib/trading/. If trading config ever needs to
// diverge, that is fine; these are protocol-level constants.
export const BASE_ADDRESSES = {
  weth: "0x4200000000000000000000000000000000000006" as Address,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  aerodromeRouter: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as Address,
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
} as const;
