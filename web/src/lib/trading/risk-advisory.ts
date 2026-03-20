// ─── Venice AI Risk Advisory Overlay ─────────────────────────────────────────
//
// Structured risk advisories from Venice AI that constrain the trading engine.
// Fail-open: if Venice is down or advisory is stale, engine runs unconstrained.

import { promises as fs } from "node:fs";
import { reportWarn } from "@/lib/report-error";

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskSeverity = "info" | "warning" | "critical";
export type RiskAction = "allow" | "reduce" | "block";

export interface RiskDirective {
  symbol: string;
  action: RiskAction;
  reason: string;
  severity: RiskSeverity;
  /** Suggested max concentration % (0-100), only for "reduce" */
  maxConcentrationPct?: number;
  /** Size multiplier (0-1), only for "reduce" */
  sizeMultiplier?: number;
}

export interface RiskAdvisory {
  timestamp: number;
  directives: RiskDirective[];
  rawText: string;
  parseStatus: "clean" | "fallback" | "failed";
}

// ── Upstash Redis (same instance as position-store) ──────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_KEY = "pooter:risk-advisory";
const ADVISORY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FS_PATH = "/tmp/pooter-risk-advisory.json";

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGetAdvisory(): Promise<RiskAdvisory | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.result) return null;
    return JSON.parse(body.result as string) as RiskAdvisory;
  } catch {
    return null;
  }
}

async function redisSetAdvisory(advisory: RiskAdvisory): Promise<boolean> {
  if (!redisEnabled()) return false;
  try {
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", REDIS_KEY, JSON.stringify(advisory)]),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Store ────────────────────────────────────────────────────────────────────

export async function getLatestAdvisory(): Promise<RiskAdvisory | null> {
  const advisory = await redisGetAdvisory();
  if (advisory && Date.now() - advisory.timestamp < ADVISORY_TTL_MS) {
    return advisory;
  }

  // Filesystem fallback
  try {
    const raw = await fs.readFile(FS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as RiskAdvisory;
    if (Date.now() - parsed.timestamp < ADVISORY_TTL_MS) {
      return parsed;
    }
  } catch { /* no cached advisory */ }

  return null;
}

async function storeAdvisory(advisory: RiskAdvisory): Promise<void> {
  const redisOk = await redisSetAdvisory(advisory);
  if (!redisOk) {
    try {
      await fs.writeFile(FS_PATH, JSON.stringify(advisory), "utf-8");
    } catch (e) { reportWarn("risk-advisory:cache-write", e); }
  }
}

// ── Structured Venice Prompt ─────────────────────────────────────────────────

function buildStructuredRiskPrompt(
  positions: Array<{
    symbol: string;
    entryPrice: number;
    currentPrice: number | null;
    unrealizedPnl: number | null;
    size: number;
    direction?: string;
    leverage?: number;
  }>,
  deployedUsd: number,
  accountValueUsd: number,
  unrealizedPnlUsd: number,
  realizedPnlUsd: number,
): string {
  const posLines = positions.length > 0
    ? positions.map(p =>
        `  ${p.symbol}: dir=${p.direction ?? "long"} lev=${p.leverage ?? 1}x entry=$${p.entryPrice.toFixed(2)} current=${p.currentPrice !== null ? `$${p.currentPrice.toFixed(2)}` : "n/a"} size=$${p.size.toFixed(2)} pnl=${p.unrealizedPnl !== null ? `$${p.unrealizedPnl.toFixed(2)}` : "n/a"}`
      ).join("\n")
    : "  (no open positions)";

  const concLines = positions.length > 0 && deployedUsd > 0
    ? positions.map(p =>
        `  ${p.symbol}: ${(p.size / deployedUsd * 100).toFixed(1)}%`
      ).join("\n")
    : "  n/a";

  return `You are a risk analysis engine. Zero data retention. Analyze the portfolio and produce STRUCTURED risk directives.

PORTFOLIO:
  Account value: $${accountValueUsd.toFixed(2)}
  Deployed: $${deployedUsd.toFixed(2)}
  Unrealized PnL: $${unrealizedPnlUsd.toFixed(2)}
  Realized PnL: $${realizedPnlUsd.toFixed(2)}
  Utilization: ${accountValueUsd > 0 ? (deployedUsd / accountValueUsd * 100).toFixed(1) : "0.0"}%

POSITIONS:
${posLines}

CONCENTRATION:
${concLines}

OUTPUT FORMAT — You MUST respond with a JSON code block first, then a one-line summary.

\`\`\`json
{
  "directives": [
    {
      "symbol": "SOL",
      "action": "reduce",
      "reason": "66% concentration exceeds 30% limit",
      "severity": "warning",
      "maxConcentrationPct": 30,
      "sizeMultiplier": 0.5
    }
  ]
}
\`\`\`
One-line summary here.

RULES:
- action must be "allow", "reduce", or "block"
- severity must be "info", "warning", or "critical"
- sizeMultiplier: 0-1 float (only for "reduce")
- maxConcentrationPct: 0-100 (only for "reduce")
- Use symbol "PORTFOLIO" for portfolio-wide directives
- Include a directive for EVERY symbol that has a concern
- If portfolio is clean, return empty directives array
- Maximum 5 directives
- Concentration > 30% = warning. > 50% = critical.
- Drawdown > 10% = warning. > 25% = critical.
- Utilization > 80% = warning.
- Correlated positions in same sector = warning.`;
}

// ── Response Parser ──────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(["allow", "reduce", "block"]);
const VALID_SEVERITIES = new Set(["info", "warning", "critical"]);

export function parseVeniceRiskResponse(rawText: string): {
  directives: RiskDirective[];
  parseStatus: "clean" | "fallback" | "failed";
} {
  // Try JSON code block extraction
  const jsonMatch = rawText.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.directives)) {
        const directives = parsed.directives
          .filter((d: Record<string, unknown>) =>
            typeof d.symbol === "string" &&
            typeof d.action === "string" &&
            typeof d.reason === "string" &&
            typeof d.severity === "string"
          )
          .map((d: Record<string, unknown>): RiskDirective => ({
            symbol: String(d.symbol).toUpperCase(),
            action: VALID_ACTIONS.has(d.action as string) ? d.action as RiskAction : "allow",
            reason: String(d.reason).slice(0, 200),
            severity: VALID_SEVERITIES.has(d.severity as string) ? d.severity as RiskSeverity : "info",
            maxConcentrationPct: typeof d.maxConcentrationPct === "number" ? d.maxConcentrationPct : undefined,
            sizeMultiplier: typeof d.sizeMultiplier === "number"
              ? Math.max(0, Math.min(1, d.sizeMultiplier))
              : undefined,
          }))
          .slice(0, 5);
        return { directives, parseStatus: "clean" };
      }
    } catch { /* JSON parse failed, fall through */ }
  }

  // Fallback: keyword-based text parsing
  const directives: RiskDirective[] = [];
  const lines = rawText.split(/[.\n]+/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("concentration") || lower.includes("overexpos")) {
      const symbolMatch = line.match(/\b([A-Z]{2,6})\b/);
      directives.push({
        symbol: symbolMatch ? symbolMatch[1] : "PORTFOLIO",
        action: "reduce",
        reason: line.trim().slice(0, 200),
        severity: lower.includes("critical") ? "critical" : "warning",
        sizeMultiplier: 0.5,
      });
    } else if (lower.includes("block") || lower.includes("avoid") || lower.includes("do not enter")) {
      const symbolMatch = line.match(/\b([A-Z]{2,6})\b/);
      directives.push({
        symbol: symbolMatch ? symbolMatch[1] : "PORTFOLIO",
        action: "block",
        reason: line.trim().slice(0, 200),
        severity: "critical",
      });
    }
  }

  return {
    directives: directives.slice(0, 5),
    parseStatus: directives.length > 0 ? "fallback" : "failed",
  };
}

// ── Advisory Lookup Helper (used by engine) ──────────────────────────────────

/**
 * Find the most restrictive directive for a symbol (block > reduce > allow).
 * Also checks PORTFOLIO-level directives.
 */
export function getAdvisoryForSymbol(
  advisory: RiskAdvisory | null,
  symbol: string,
): RiskDirective | null {
  if (!advisory || advisory.directives.length === 0) return null;

  const upper = symbol.toUpperCase();
  const matching = advisory.directives.filter(
    d => d.symbol === upper || d.symbol === "PORTFOLIO",
  );
  if (matching.length === 0) return null;

  // Most restrictive wins
  const blocked = matching.find(d => d.action === "block");
  if (blocked) return blocked;

  const reduced = matching.find(d => d.action === "reduce");
  if (reduced) return reduced;

  return matching[0];
}

// ── Venice Risk Poller ───────────────────────────────────────────────────────

export async function pollVeniceRiskAdvisory(): Promise<RiskAdvisory> {
  const VENICE_BASE_URL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
  const VENICE_API_KEY = process.env.VENICE_API_KEY || "";
  const VENICE_MODEL = process.env.VENICE_LLM_MODEL || "llama-3.3-70b";

  if (!VENICE_API_KEY) {
    throw new Error("VENICE_API_KEY not configured");
  }

  // Build context from engine performance data (lazy import to avoid bundling engine deps)
  let positions: Array<{ symbol: string; entryPrice: number; currentPrice: number; unrealizedPnl: number; size: number; direction: string; leverage: number }> = [];
  let deployedUsd = 0;
  let openMarketValueUsd = 0;
  let unrealizedPnlUsd = 0;
  let realizedPnlUsd = 0;

  try {
    const mod = await import(/* webpackIgnore: true */ "./engine");
    const perf = await mod.getTraderPerformance();
    positions = perf.open.map((o: any) => ({
      symbol: o.position.marketSymbol ?? o.position.tokenAddress.slice(0, 8),
      entryPrice: o.position.entryPriceUsd,
      currentPrice: o.currentPriceUsd,
      unrealizedPnl: o.unrealizedPnlUsd,
      size: o.position.entryNotionalUsd,
      direction: o.position.direction ?? "long",
      leverage: o.position.leverage ?? 1,
    }));
    deployedUsd = perf.totals.deployedUsd;
    openMarketValueUsd = perf.totals.openMarketValueUsd || perf.totals.deployedUsd;
    unrealizedPnlUsd = perf.totals.unrealizedPnlUsd;
    realizedPnlUsd = perf.totals.realizedPnlUsd;
  } catch {
    // Engine import failed at build time — use empty defaults
  }

  const prompt = buildStructuredRiskPrompt(
    positions,
    deployedUsd,
    openMarketValueUsd,
    unrealizedPnlUsd,
    realizedPnlUsd,
  );

  // Non-streaming call — need complete response for JSON parsing
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VENICE_MODEL,
        stream: false,
        max_tokens: 512,
        temperature: 0.2,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Analyze current portfolio risk. Respond with structured JSON directives." },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Venice Risk API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";
    const { directives, parseStatus } = parseVeniceRiskResponse(rawText);

    const advisory: RiskAdvisory = {
      timestamp: Date.now(),
      directives,
      rawText,
      parseStatus,
    };

    await storeAdvisory(advisory);

    // Publish to message bus (fire and forget)
    try {
      const { randomUUID } = await import("node:crypto");
      // @ts-ignore Node16 moduleResolution requires .js but formatters remove it
      const { messageBus } = await import("../agents/core/bus");
      await messageBus.publish({
        id: randomUUID(),
        from: "venice-risk-oracle",
        to: "*",
        topic: "trading.risk-advisory",
        payload: advisory,
        timestamp: Date.now(),
      });
    } catch { /* bus publish failure is non-fatal */ }

    console.log(
      `[risk-advisory] polled Venice: ${directives.length} directives (parse=${parseStatus})`,
    );

    return advisory;
  } finally {
    clearTimeout(timeout);
  }
}
