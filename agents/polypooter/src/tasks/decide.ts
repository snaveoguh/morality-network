/**
 * polypooter autonomous decide-loop.
 *
 * Same scaffold as pooter1's decide but with a prediction-market angle:
 * polypooter watches Polymarket arb opportunities and, when nothing
 * arbable is open, falls back to the same Base-trenches skill set.
 *
 * Required env (same as pooter1):
 *   AGENT_API_BASE_URL          — https://dev.pooter.world (or prod)
 *   AGENT_WORKER_HMAC_SECRET    — shared with web
 *   DECIDE_ENABLED              — "true" to turn the loop on (default off)
 *   DECIDE_DRY_RUN              — "false" to actually execute (default dry-run)
 *   DECIDE_INTERVAL_MS          — default 900_000 (15 min)
 */
import { generate } from "../llm.js";
import {
  getPortfolio,
  runSkill,
  type Portfolio,
  type RunSkillResult,
} from "../../../shared/wallet-client.js";
import {
  formatCandidatesForPrompt,
  getBaseCandidates,
  type BaseTokenCandidate,
} from "../../../shared/signals.js";
import { getLastScanResults } from "./scan-markets.js";
import type { ArbOpportunity } from "../arb-detector.js";

const AGENT_ID = "polypooter";

const SKILL_CATALOG: Record<string, string> = {
  swap:
    'swap one ERC-20 for another on Base via Uniswap V3 or Aerodrome. params: { tokenIn (0x address), tokenOut (0x address), amountIn (string, raw units), amountOutMin (string), dex ("uniswap-v3"|"aerodrome"), poolFee? (number) }',
  "tip-agent":
    'send native ETH or an ERC-20 to a sibling agent\'s SCW. params: { toAgentId (string e.g. "pooter1"), token? (0x or omit for ETH), amount (string, wei) }',
  transfer:
    'send native ETH or an ERC-20 to any address. params: { token? (0x or omit for ETH), to (0x), amount (string, raw units) }',
  wrap:
    'wrap ETH→WETH (direction:"wrap") or unwrap WETH→ETH (direction:"unwrap") on Base. params: { direction, amount (string, wei) }',
  abstain: "do nothing this tick. params: {} — preferred when no edge is visible",
};

const NORTH_STAR = `
You are polypooter, an autonomous agent on the pooter network on Base mainnet (chain 8453).
Your specialty: prediction-market intelligence. Polymarket reveals crowd beliefs about
future events; when an outcome diverges from spot price, that is your edge.

Objective has three terms:
  1. REWARD: create measurable value — arbitrage, alpha, directional bets on revealed info
  2. HARD CONSTRAINT: never spend more than 20% of total ETH+USDC balance in a single tick
  3. COOPERATION: if pooter1 is doing visible useful work, tip — the network wins together
Treat each tick like a hand of poker: skip unless EV is positive. Abstaining is fine.
You can only use the skill catalog below. Output strict JSON.`.trim();

interface DecisionJson {
  action: string;
  params: Record<string, unknown>;
  reasoning: string;
}

function formatArbOpportunitiesForPrompt(opps: ArbOpportunity[]): string {
  if (opps.length === 0) return "(no Polymarket arb opportunities open right now)";
  return opps
    .slice(0, 5)
    .map((o) => {
      const legs = o.markets.map((m) => `${m.side} ${m.bestAsk.toFixed(3)}`).join(" + ");
      return `  • ${o.strategy.padEnd(14)} "${o.eventTitle.slice(0, 60)}" cost=$${o.totalCost.toFixed(2)} net=${o.netProfitPct.toFixed(2)}% liq=$${o.liquidity.toFixed(0)} legs=[${legs}]`;
    })
    .join("\n");
}

function buildPrompt(
  portfolio: Portfolio,
  candidates: BaseTokenCandidate[],
  arbs: ArbOpportunity[],
): { system: string; user: string } {
  const balanceLines = portfolio.balances
    .map((b) => `  ${b.symbol}: ${b.formatted} (raw=${b.raw})`)
    .join("\n");

  const skillLines = Object.entries(SKILL_CATALOG)
    .map(([name, desc]) => `  • ${name}: ${desc}`)
    .join("\n");

  const system = `${NORTH_STAR}

SKILL CATALOG:
${skillLines}

RESPONSE FORMAT — strict JSON, no commentary, no markdown fences:
{ "action": "<skill name>", "params": { ... }, "reasoning": "<one sentence>" }`;

  const user = `Current state:
  agent: ${portfolio.agentId}
  wallet: ${portfolio.address}
  chain: Base (8453)

Holdings:
${balanceLines || "  (empty)"}

Polymarket arb opportunities right now:
${formatArbOpportunitiesForPrompt(arbs)}

Top Base pools right now (sorted by 24h volume; high vol+liq, watch the 24h move):
${formatCandidatesForPrompt(candidates)}

Pick one skill from the catalog. Arb opportunities can't be executed on-chain
through these skills (they're CLOB-side); if you see strong arbs, your only
move is to abstain or tip pooter1 to reinforce its trading capital. If the
Base pools show a strong setup that fits your prediction-market view, swap.`;

  return { system, user };
}

function parseDecision(raw: string): DecisionJson {
  let cleaned = raw.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const parsed = JSON.parse(cleaned) as Partial<DecisionJson>;
  if (typeof parsed.action !== "string") throw new Error("missing 'action'");
  if (!parsed.params || typeof parsed.params !== "object")
    throw new Error("missing 'params'");
  return {
    action: parsed.action,
    params: parsed.params as Record<string, unknown>,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

function shouldDryRun(): boolean {
  return (process.env.DECIDE_DRY_RUN ?? "true").toLowerCase() !== "false";
}

export interface DecideOutcome {
  decision: DecisionJson;
  executed: boolean;
  dryRun: boolean;
  result?: RunSkillResult;
  error?: string;
}

export async function decideOnce(): Promise<DecideOutcome> {
  const [portfolio, candidates] = await Promise.all([
    getPortfolio(AGENT_ID),
    getBaseCandidates({ limit: 8 }).catch(() => [] as BaseTokenCandidate[]),
  ]);
  const arbs = getLastScanResults().opportunities;

  const { system, user } = buildPrompt(portfolio, candidates, arbs);
  const raw = await generate({ system, user, maxTokens: 600, temperature: 0.4 });

  let decision: DecisionJson;
  try {
    decision = parseDecision(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[polypooter:decide] parse failed: ${msg} — raw=${raw.slice(0, 200)}`);
    return {
      decision: { action: "abstain", params: {}, reasoning: `parse error: ${msg}` },
      executed: false,
      dryRun: shouldDryRun(),
      error: msg,
    };
  }

  console.log(
    `[polypooter:decide] action=${decision.action} reasoning="${decision.reasoning}"`,
  );

  if (decision.action === "abstain") {
    return { decision, executed: false, dryRun: shouldDryRun() };
  }

  if (shouldDryRun()) {
    console.log(`[polypooter:decide] DRY_RUN — would execute ${decision.action}`);
    return { decision, executed: false, dryRun: true };
  }

  try {
    const result = await runSkill({
      agentId: AGENT_ID,
      skill: decision.action,
      params: decision.params,
    });
    console.log(
      `[polypooter:decide] executed ${decision.action} → ${result.txHash}`,
    );
    return { decision, executed: true, dryRun: false, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[polypooter:decide] execute failed: ${msg}`);
    return { decision, executed: false, dryRun: false, error: msg };
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /decide\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  decideOnce()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[polypooter:decide] fatal:", err);
      process.exit(1);
    });
}
