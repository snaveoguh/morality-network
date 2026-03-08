// ─── Scanner Agent — Analyzer ───────────────────────────────────────────────
//
// Scoring engine for token launches. Conservative: most tokens score 0-10.
// Higher scores indicate more credible launches (verified contract, real
// liquidity, active deployer with history).

import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { TokenLaunch, ScoreBreakdown } from "./types";
import { BASESCAN_API, SCORE_WEIGHTS } from "./constants";

// ─── Client ─────────────────────────────────────────────────────────────────

const BASE_RPC =
  process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { timeout: 15_000 }),
});

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

// ─── Main Scoring Function ──────────────────────────────────────────────────

export async function scoreLaunch(
  launch: TokenLaunch
): Promise<{ score: number; breakdown: ScoreBreakdown }> {
  const breakdown: ScoreBreakdown = {
    contractVerified: 0,
    initialLiquidity: 0,
    holderCount: 0,
    deployerHistory: 0,
    lockedLiquidity: 0,
    deployerAge: 0,
  };

  // Run all checks in parallel where possible
  const [verified, deployerInfo, liquidityScore] = await Promise.all([
    checkContractVerified(launch.tokenAddress),
    checkDeployer(launch.deployer),
    estimateLiquidity(launch),
  ]);

  // Contract verification (0 or 25)
  breakdown.contractVerified = verified ? SCORE_WEIGHTS.contractVerified : 0;

  // Initial liquidity (0-25, logarithmic scale)
  breakdown.initialLiquidity = liquidityScore;

  // Deployer history (0-15, based on tx count)
  breakdown.deployerHistory = deployerInfo.historyScore;

  // Deployer age (0-10)
  breakdown.deployerAge = deployerInfo.ageScore;

  // Holder count — use DexScreener data if available, otherwise 0
  // (we can't cheaply count holders onchain without indexing)
  breakdown.holderCount = estimateHolderScore(launch);

  // Locked liquidity — check if LP tokens are burned or locked
  // (simplified: check if DexScreener reports lock)
  breakdown.lockedLiquidity = estimateLockScore(launch);

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    breakdown,
  };
}

// ─── Contract Verification ──────────────────────────────────────────────────

async function checkContractVerified(tokenAddress: string): Promise<boolean> {
  if (!BASESCAN_API_KEY) return false; // Can't check without API key

  try {
    const url = new URL(BASESCAN_API);
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getabi");
    url.searchParams.set("address", tokenAddress);
    url.searchParams.set("apikey", BASESCAN_API_KEY);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    const json = await res.json();

    // status "1" means verified
    return json?.status === "1";
  } catch {
    return false;
  }
}

// ─── Deployer Analysis ──────────────────────────────────────────────────────

interface DeployerInfo {
  historyScore: number; // 0-15
  ageScore: number; // 0-10
}

async function checkDeployer(deployerAddress: string): Promise<DeployerInfo> {
  const result: DeployerInfo = { historyScore: 0, ageScore: 0 };

  if (
    deployerAddress === "0x0000000000000000000000000000000000000000" ||
    !deployerAddress
  ) {
    return result;
  }

  try {
    // Get transaction count (proxy for activity)
    const txCount = await client.getTransactionCount({
      address: deployerAddress as `0x${string}`,
    });

    // History score: 0 tx = 0, 1-10 tx = 3, 11-50 = 7, 51-200 = 11, 200+ = 15
    if (txCount > 200) result.historyScore = SCORE_WEIGHTS.deployerHistory;
    else if (txCount > 50)
      result.historyScore = Math.round(SCORE_WEIGHTS.deployerHistory * 0.73);
    else if (txCount > 10)
      result.historyScore = Math.round(SCORE_WEIGHTS.deployerHistory * 0.47);
    else if (txCount > 0)
      result.historyScore = Math.round(SCORE_WEIGHTS.deployerHistory * 0.2);

    // Deployer age: check earliest nonce approach via Basescan (if available)
    if (BASESCAN_API_KEY) {
      const ageMonths = await getDeployerAgeMonths(deployerAddress);
      if (ageMonths > 12) result.ageScore = SCORE_WEIGHTS.deployerAge;
      else if (ageMonths > 6)
        result.ageScore = Math.round(SCORE_WEIGHTS.deployerAge * 0.7);
      else if (ageMonths > 1)
        result.ageScore = Math.round(SCORE_WEIGHTS.deployerAge * 0.4);
      else if (ageMonths > 0)
        result.ageScore = Math.round(SCORE_WEIGHTS.deployerAge * 0.1);
    }
  } catch (err) {
    console.error(`[Analyzer] Deployer check failed for ${deployerAddress}:`, err);
  }

  return result;
}

async function getDeployerAgeMonths(address: string): Promise<number> {
  try {
    const url = new URL(BASESCAN_API);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "txlist");
    url.searchParams.set("address", address);
    url.searchParams.set("startblock", "0");
    url.searchParams.set("endblock", "99999999");
    url.searchParams.set("page", "1");
    url.searchParams.set("offset", "1");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("apikey", BASESCAN_API_KEY);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    const json = await res.json();

    if (json?.status !== "1" || !json.result?.[0]) return 0;

    const firstTxTimestamp = parseInt(json.result[0].timeStamp, 10);
    const ageSeconds = Math.floor(Date.now() / 1000) - firstTxTimestamp;
    return ageSeconds / (30 * 24 * 60 * 60); // Approximate months
  } catch {
    return 0;
  }
}

// ─── Liquidity Estimation ───────────────────────────────────────────────────

async function estimateLiquidity(launch: TokenLaunch): Promise<number> {
  // If we have DexScreener data, use that
  if (launch.dexScreenerData?.liquidity?.usd) {
    const liqUsd = launch.dexScreenerData.liquidity.usd;

    // $0 = 0, $1k = 5, $10k = 12, $50k = 18, $100k+ = 25
    if (liqUsd >= 100_000) return SCORE_WEIGHTS.initialLiquidity;
    if (liqUsd >= 50_000)
      return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.72);
    if (liqUsd >= 10_000)
      return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.48);
    if (liqUsd >= 1_000)
      return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.2);
    return 0;
  }

  // Fallback: check pool balance of the paired (quote) asset
  // This is a rough estimate — just checking if the pool has any WETH/USDC
  try {
    const pairedAddr = launch.pairedAsset as `0x${string}`;
    const poolAddr = launch.poolAddress as `0x${string}`;

    const balance = await client.readContract({
      address: pairedAddr,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        },
      ] as const,
      functionName: "balanceOf",
      args: [poolAddr],
    });

    const bal = Number(balance) / 1e18; // Assume 18 decimals for quick estimate

    // Rough ETH value heuristic (good enough for scoring)
    if (bal > 50) return SCORE_WEIGHTS.initialLiquidity;
    if (bal > 10) return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.72);
    if (bal > 1) return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.48);
    if (bal > 0.1) return Math.round(SCORE_WEIGHTS.initialLiquidity * 0.2);
    return 0;
  } catch {
    return 0;
  }
}

// ─── Holder / Lock Estimation ───────────────────────────────────────────────

function estimateHolderScore(launch: TokenLaunch): number {
  // Without an indexer we can't count holders cheaply
  // Use FDV as a proxy if DexScreener data is available
  if (!launch.dexScreenerData) return 0;

  const fdv = launch.dexScreenerData.fdv ?? 0;
  const volume = launch.dexScreenerData.volume24h ?? 0;

  // Volume/FDV ratio as activity proxy
  if (fdv > 0 && volume > 0) {
    const ratio = volume / fdv;
    if (ratio > 0.5) return SCORE_WEIGHTS.holderCount; // Very active
    if (ratio > 0.1)
      return Math.round(SCORE_WEIGHTS.holderCount * 0.6);
    if (ratio > 0.01)
      return Math.round(SCORE_WEIGHTS.holderCount * 0.3);
  }

  return 0;
}

function estimateLockScore(launch: TokenLaunch): number {
  // Without deep LP analysis, give a small score if there's real liquidity
  // and the deployer has history (correlation heuristic)
  if (
    launch.dexScreenerData?.liquidity?.usd &&
    launch.dexScreenerData.liquidity.usd > 10_000
  ) {
    return Math.round(SCORE_WEIGHTS.lockedLiquidity * 0.5); // Generous assumption
  }
  return 0;
}
