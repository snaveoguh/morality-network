/**
 * pooter1 autonomous decide-loop.
 *
 * Every tick, gathers context (portfolio + signals), asks the LLM to pick
 * ONE skill to invoke (or abstain), and executes via the smart wallet.
 *
 * Safety: defaults to dry-run (DECIDE_DRY_RUN=true) — logs the chosen
 * action but does not execute. Flip to "false" to enable real spending.
 *
 * Required env on this service:
 *   AGENT_API_BASE_URL          — https://dev.pooter.world (or prod)
 *   AGENT_WORKER_HMAC_SECRET    — shared with web
 *   DECIDE_ENABLED              — "true" to turn the loop on (default off)
 *   DECIDE_DRY_RUN              — "false" to actually execute (default dry-run)
 *   DECIDE_INTERVAL_MS          — default 900_000 (15 min)
 *
 * On the web side: BASE_SMART_WALLETS_ENABLED, AGENT_WALLETS_MASTER_SEED,
 * PIMLICO_API_KEY, AGENT_WORKER_HMAC_SECRET must all be set.
 */
import { generate } from "../llm.js";
import {
  getPortfolio,
  runSkill,
  type Portfolio,
  type RunSkillResult,
} from "../../../shared/wallet-client.js";

const AGENT_ID = "pooter1";

const SKILL_CATALOG: Record<string, string> = {
  swap:
    'swap one ERC-20 for another on Base via Uniswap V3 or Aerodrome. params: { tokenIn (0x address), tokenOut (0x address), amountIn (string, raw units), amountOutMin (string), dex ("uniswap-v3"|"aerodrome"), poolFee? (number, uniswap only) }',
  "tip-agent":
    'send native ETH or an ERC-20 to a sibling agent\'s SCW. params: { toAgentId (string), token? (0x or omit for ETH), amount (string, wei) }',
  transfer:
    'send native ETH or an ERC-20 to any address. params: { token? (0x or omit for ETH), to (0x), amount (string, raw units) }',
  wrap:
    'wrap ETH→WETH (direction:"wrap") or unwrap WETH→ETH (direction:"unwrap") on Base. params: { direction, amount (string, wei) }',
  abstain: "do nothing this tick. params: {} — use when no clear positive-EV action exists",
};

const NORTH_STAR = `
You are pooter1, an autonomous agent on the pooter network on Base mainnet (chain 8453).
Your objective has three terms:
  1. REWARD: create measurable value — accurate predictions, smart trades, signal quality
  2. HARD CONSTRAINT: never spend more than 20% of your total ETH+USDC balance in a single tick
  3. COOPERATION: when a sibling agent is doing useful work, tip them — this lifts the network
Treat each tick like a hand of poker: skip unless the EV is positive. Abstaining is fine.
You can only use the skill catalog below. Output strict JSON.`.trim();

interface DecisionJson {
  action: string;
  params: Record<string, unknown>;
  reasoning: string;
}

function buildPrompt(portfolio: Portfolio): { system: string; user: string } {
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

Pick one skill from the catalog. If nothing looks positive-EV right now, pick "abstain".`;

  return { system, user };
}

function parseDecision(raw: string): DecisionJson {
  // Strip code fences if the model added any.
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
  const portfolio = await getPortfolio(AGENT_ID);

  const { system, user } = buildPrompt(portfolio);
  const raw = await generate({ system, user, maxTokens: 600, temperature: 0.4 });

  let decision: DecisionJson;
  try {
    decision = parseDecision(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pooter1:decide] parse failed: ${msg} — raw=${raw.slice(0, 200)}`);
    return {
      decision: { action: "abstain", params: {}, reasoning: `parse error: ${msg}` },
      executed: false,
      dryRun: shouldDryRun(),
      error: msg,
    };
  }

  console.log(
    `[pooter1:decide] action=${decision.action} reasoning="${decision.reasoning}"`,
  );

  if (decision.action === "abstain") {
    return { decision, executed: false, dryRun: shouldDryRun() };
  }

  if (shouldDryRun()) {
    console.log(`[pooter1:decide] DRY_RUN — would execute ${decision.action}`);
    return { decision, executed: false, dryRun: true };
  }

  try {
    const result = await runSkill({
      agentId: AGENT_ID,
      skill: decision.action,
      params: decision.params,
    });
    console.log(
      `[pooter1:decide] executed ${decision.action} → ${result.txHash}`,
    );
    return { decision, executed: true, dryRun: false, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pooter1:decide] execute failed: ${msg}`);
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
      console.error("[pooter1:decide] fatal:", err);
      process.exit(1);
    });
}
