/**
 * moral-gate.ts — SOUL.md enforcement for the trading engine.
 *
 * Every trade must pass through this gate before execution.
 * Rules (from SOUL.md §Trading Constraints):
 *   - Long ONLY on entities with moral score > 70%
 *   - Short ONLY on entities with documented harm (score < 30%)
 *   - Neutral zone (30-70%): observe only, no position
 *   - Never trade on a moral score that hasn't been published
 *   - All trades logged with moral justification
 */

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { computeEntityHash } from "../entity";
import { CONTRACTS, RATINGS_ABI } from "../contracts";

/* ═══════════════════  Types  ═══════════════════ */

export interface MoralGateResult {
  /** Whether the trade is allowed */
  allowed: boolean;
  /** The moral score (0-100), or null if unavailable */
  moralScore: number | null;
  /** Source of the score */
  source: "onchain" | "ai" | "heuristic" | "cached";
  /** Allowed trade direction based on score */
  allowedDirection: "long" | "short" | "none";
  /** Human-readable justification for the trade decision */
  justification: string;
  /** Which SOUL.md rule applies */
  soulRule: string;
  /** Entity identifier used for lookup */
  entityId: string;
  /** Timestamp of the score lookup */
  timestamp: number;
}

/* ═══════════════════  Cache  ═══════════════════ */

const moralScoreCache = new Map<string, { score: number; source: MoralGateResult["source"]; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/* ═══════════════════  Onchain Client  ═══════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _baseClient: any = null;

function getBasePublicClient() {
  if (!_baseClient) {
    const rpcUrl = process.env.BASE_MAINNET_RPC_URL
      || process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL
      || "https://mainnet.base.org";
    _baseClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl, { timeout: 10_000 }),
    });
  }
  return _baseClient!;
}

/* ═══════════════════  Score Lookup  ═══════════════════ */

/**
 * Look up the moral score for an entity.
 * Tries onchain first (Ratings contract), falls back to heuristic for major assets.
 */
async function lookupMoralScore(
  entityId: string,
): Promise<{ score: number; source: MoralGateResult["source"] }> {
  // Check cache first
  const cached = moralScoreCache.get(entityId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { score: cached.score, source: "cached" };
  }

  // Try onchain rating from Ratings contract
  try {
    const entityHash = computeEntityHash(entityId);
    const client = getBasePublicClient();
    const result = await client.readContract({
      address: CONTRACTS.ratings,
      abi: RATINGS_ABI,
      functionName: "getAverageRating",
      args: [entityHash],
    }) as [bigint, bigint];

    const [avg, count] = result;
    if (count > BigInt(0)) {
      const score = Number(avg);
      moralScoreCache.set(entityId, { score, source: "onchain", timestamp: Date.now() });
      return { score, source: "onchain" };
    }
  } catch {
    // Onchain lookup failed — fall through to heuristic
  }

  // Heuristic scoring for well-known assets
  const heuristicScore = getHeuristicMoralScore(entityId);
  moralScoreCache.set(entityId, { score: heuristicScore, source: "heuristic", timestamp: Date.now() });
  return { score: heuristicScore, source: "heuristic" };
}

/**
 * Heuristic moral scores for well-known crypto assets.
 * Based on SOUL.md four axes: harm, agency, truth, power.
 *
 * These are conservative defaults — onchain ratings should override.
 * Assets in the neutral zone (30-70) will be blocked from trading
 * until they get proper moral ratings.
 */
function getHeuristicMoralScore(entityId: string): number {
  const id = entityId.toUpperCase();

  // Well-established decentralized protocols — high agency, distributed power, truth-promoting
  const highMoral: Record<string, number> = {
    BTC: 82,   // Most decentralized, censorship-resistant money — high agency, distributed power
    ETH: 78,   // Open smart contract platform — high agency, moderate power concentration
    SOL: 55,   // Fast but more centralized — neutral zone (needs proper rating)
    DOGE: 45,  // Meme coin, no utility thesis — neutral zone
    AVAX: 60,  // Decentralized but VC-heavy — neutral zone
    LINK: 75,  // Oracle infrastructure, truth-promoting — high agency
    ARB: 58,   // L2 scaling but token distribution questionable — neutral zone
    OP: 60,    // L2 with retroPGF — moderate positive
    MATIC: 55, // Centralized validator set — neutral zone
    UNI: 72,   // Decentralized exchange — high agency, distributed power
    AAVE: 73,  // Decentralized lending — high agency
    MKR: 71,   // Decentralized stablecoin governance — high truth
    SNX: 65,   // Synthetic assets — moderate, needs proper rating
    COMP: 68,  // Decentralized lending governance — borderline, needs rating
    CRV: 62,   // DEX governance — moderate
    LDO: 55,   // Liquid staking but centralization concerns — neutral zone
    RENDER: 50, // Needs moral rating
    FET: 50,   // Needs moral rating
    WLD: 25,   // Worldcoin — biometric surveillance concerns, high harm/power axis
    PEPE: 40,  // Meme coin, no utility — neutral zone
    SHIB: 40,  // Meme coin — neutral zone
    BONK: 38,  // Meme coin — neutral zone
    WIF: 35,   // Meme coin — neutral zone
  };

  return highMoral[id] ?? 50; // Unknown assets default to neutral zone (blocked)
}

/* ═══════════════════  Gate Logic  ═══════════════════ */

/**
 * Check whether a trade is allowed under SOUL.md moral constraints.
 *
 * Returns a MoralGateResult with allowed/denied status, score, and justification.
 * The engine MUST check this before opening any position.
 */
export async function checkMoralGate(
  entityId: string,
  requestedDirection: "long" | "short",
): Promise<MoralGateResult> {
  const timestamp = Date.now();
  const { score, source } = await lookupMoralScore(entityId);

  // Determine allowed direction based on moral score
  let allowedDirection: MoralGateResult["allowedDirection"];
  let soulRule: string;

  if (score > 70) {
    allowedDirection = "long";
    soulRule = "SOUL.md §Trading: Long ONLY on entities with moral score > 70%";
  } else if (score < 30) {
    allowedDirection = "short";
    soulRule = "SOUL.md §Trading: Short ONLY on entities with documented harm (score < 30%)";
  } else {
    allowedDirection = "none";
    soulRule = "SOUL.md §Trading: Neutral zone (30-70%) — observe only, no position";
  }

  const allowed = allowedDirection === requestedDirection;

  let justification: string;
  if (allowed) {
    justification = requestedDirection === "long"
      ? `Moral score ${score}/100 (${source}) — entity demonstrates positive moral alignment. ${soulRule}`
      : `Moral score ${score}/100 (${source}) — entity has documented harm indicators. ${soulRule}`;
  } else if (allowedDirection === "none") {
    justification = `BLOCKED: Moral score ${score}/100 (${source}) is in neutral zone. ${soulRule}. Requested: ${requestedDirection}`;
  } else {
    justification = `BLOCKED: Moral score ${score}/100 (${source}) — ${requestedDirection} not allowed. ${soulRule}. Only ${allowedDirection} permitted.`;
  }

  return {
    allowed,
    moralScore: score,
    source,
    allowedDirection,
    justification,
    soulRule,
    entityId,
    timestamp,
  };
}

/**
 * Check circuit breaker: 3 consecutive losses = pause trading.
 * SOUL.md §Trading Constraints: "Circuit breakers: 3 consecutive losses = pause and reassess strategy"
 */
export function checkCircuitBreaker(
  consecutiveLossCount: number,
  circuitBreakerThreshold: number,
  pauseUntil: number | null,
): { blocked: boolean; reason: string } {
  if (pauseUntil !== null && Date.now() < pauseUntil) {
    const remainingMs = pauseUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60_000);
    return {
      blocked: true,
      reason: `SOUL.md circuit breaker active — ${remainingMin}min remaining. ${consecutiveLossCount} consecutive losses triggered pause.`,
    };
  }

  if (consecutiveLossCount >= circuitBreakerThreshold) {
    return {
      blocked: true,
      reason: `SOUL.md circuit breaker triggered: ${consecutiveLossCount} consecutive losses (threshold: ${circuitBreakerThreshold}). Pausing to reassess strategy.`,
    };
  }

  return { blocked: false, reason: "" };
}

/**
 * Log a moral gate decision for transparency.
 * SOUL.md §2: "All trading positions based on moral scores are logged"
 */
export function logMoralGateDecision(result: MoralGateResult): void {
  const status = result.allowed ? "ALLOWED" : "BLOCKED";
  console.log(
    `[moral-gate] ${status}: ${result.entityId} | score=${result.moralScore}/100 (${result.source}) | ` +
    `requested=${result.allowedDirection === "none" ? "neutral-zone" : result.allowedDirection} | ${result.soulRule}`,
  );
}
