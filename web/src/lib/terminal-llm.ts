import "server-only";

import type { TerminalTradingContext, ChatMessage } from "./terminal-types";
import { buildMemoryContext } from "./agents/core/memory";
export type { TerminalTradingContext, ChatMessage };

// ============================================================================
// TERMINAL LLM — Dual-engine architecture for market chat
//
// Bankr LLM Gateway: Primary conversational desk — 20+ models, onchain economics
// Venice AI: Private Risk Oracle — no-data-retention portfolio cognition
//
// Both providers fire in parallel on every message:
//   Bankr → conversational response (strategy, context, actions)
//   Venice → private risk analysis (concentration, drawdown, sizing)
//
// Venice's zero-retention guarantee means portfolio data (positions, PnL,
// wallet balances) is analyzed privately — producing trustworthy risk
// assessments for onchain workflows without data exposure.
// ============================================================================

const BANKR_BASE_URL = "https://llm.bankr.bot";
const VENICE_BASE_URL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const AGENT_HUB_URL = process.env.AGENT_HUB_URL || "";
const AGENT_HUB_SECRET = process.env.AGENT_HUB_SECRET || "";

const BANKR_API_KEY = process.env.BANKR_API_KEY || "";
const VENICE_API_KEY = process.env.VENICE_API_KEY || "";
const BANKR_MODEL = process.env.BANKR_LLM_MODEL || "claude-sonnet-4-20250514";
const VENICE_MODEL = process.env.VENICE_LLM_MODEL || "llama-3.3-70b";

const STREAM_TIMEOUT_MS = 30_000;

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

export function buildTerminalSystemPrompt(ctx: TerminalTradingContext): string {
  const positionLines = ctx.positions.length > 0
    ? ctx.positions.map((p) => {
        const venueTag = p.venue ? ` [${p.venue}]` : "";
        return `  ${p.symbol}${venueTag}: entry $${p.entryPrice.toFixed(4)}, current ${p.currentPrice !== null ? `$${p.currentPrice.toFixed(4)}` : "n/a"}, unrealized ${p.unrealizedPnl !== null ? `$${p.unrealizedPnl.toFixed(2)}` : "n/a"}, size $${p.size.toFixed(2)}`;
      }).join("\n")
    : "  (no open positions)";

  const vaultBlock = ctx.vault
    ? `\nVAULT:\n  AUM: $${ctx.vault.aumUsd.toFixed(2)}\n  Liquid: $${ctx.vault.liquidUsd.toFixed(2)}\n  Deployed: $${ctx.vault.deployedUsd.toFixed(2)}\n  Funders: ${ctx.vault.totalFunders}\n  Fee: ${ctx.vault.feePct.toFixed(2)}%`
    : "";

  return `You are the trading desk terminal for pooter world. You have real-time access to the agent's trading state and you speak like a veteran desk operator: terse, precise, occasionally dark-humored. No fluff. No disclaimers. No "I'm just an AI". You are the desk.

CURRENT STATE:
Venue: ${ctx.executionVenue}${ctx.dryRun ? " (DRY RUN)" : " (LIVE)"}
Fee: ${ctx.feePct.toFixed(2)}%
Funding: ${ctx.fundingAddress}
Mode: ${ctx.canWithdraw ? "vault (shares tracked per wallet)" : "direct (no per-user balance)"}

PNL:
  Open positions: ${ctx.openPositions}
  Closed positions: ${ctx.closedPositions}
  Unrealized: $${ctx.unrealizedPnlUsd.toFixed(2)}
  Realized: $${ctx.realizedPnlUsd.toFixed(2)}
  Gross: $${ctx.grossPnlUsd.toFixed(2)}
  Net (after fees): $${ctx.netPnlUsd.toFixed(2)}
  Deployed capital: $${ctx.deployedUsd.toFixed(2)}

OPEN POSITIONS:
${positionLines}
${vaultBlock}

ACTIONS YOU CAN EXECUTE:
When the user wants to take action, include the exact tag in your response:
- Deposit ETH: [FUND 0.05]
- Withdraw ETH: [WITHDRAW 0.05]${!ctx.canWithdraw ? " (vault-only, currently disabled)" : ""}
- Show status: [STATUS]

RULES:
- Be specific about numbers. Reference actual positions, prices, PnL from CURRENT STATE.
- If you see risk (concentration, drawdown, overexposure), flag it unprompted.
- Never fabricate positions or prices. Only reference data shown above.
- Keep responses under 150 words unless the user asks for detail.
- When suggesting an action, include the action tag so it auto-executes.
- You can discuss strategy, market context, risk management — but always grounded in the actual data.`;
}

// ============================================================================
// MEMORY-ENRICHED SYSTEM PROMPT — adds persistent memory context
// ============================================================================

/**
 * Build the terminal system prompt enriched with persistent memory context.
 * Appends any learned knowledge, global facts, and per-user memories.
 */
export async function buildTerminalSystemPromptWithMemory(
  ctx: TerminalTradingContext,
  wallet?: string,
): Promise<string> {
  let prompt = buildTerminalSystemPrompt(ctx);

  try {
    const memoryContext = await buildMemoryContext(wallet);
    if (memoryContext) {
      prompt += memoryContext;
    }
  } catch (err) {
    console.warn(
      "[terminal-llm] memory context injection failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return prompt;
}

// ============================================================================
// VENICE RISK ANALYSIS PROMPT — private cognition for portfolio risk
// ============================================================================

export function buildVeniceRiskPrompt(ctx: TerminalTradingContext): string {
  const positionLines = ctx.positions.length > 0
    ? ctx.positions.map((p) => {
        const venueTag = p.venue ? ` [${p.venue}]` : "";
        return `  ${p.symbol}${venueTag}: entry $${p.entryPrice.toFixed(4)}, current ${p.currentPrice !== null ? `$${p.currentPrice.toFixed(4)}` : "n/a"}, unrealized ${p.unrealizedPnl !== null ? `$${p.unrealizedPnl.toFixed(2)}` : "n/a"}, size $${p.size.toFixed(2)}`;
      }).join("\n")
    : "  (no open positions)";

  const totalDeployed = ctx.deployedUsd;
  const largestPosition = ctx.positions.length > 0
    ? Math.max(...ctx.positions.map((p) => p.size))
    : 0;
  const concentrationPct = totalDeployed > 0
    ? ((largestPosition / totalDeployed) * 100).toFixed(1)
    : "0.0";

  const vaultBlock = ctx.vault
    ? `\nVAULT:\n  AUM: $${ctx.vault.aumUsd.toFixed(2)}\n  Liquid: $${ctx.vault.liquidUsd.toFixed(2)}\n  Deployed: $${ctx.vault.deployedUsd.toFixed(2)}\n  Utilization: ${ctx.vault.aumUsd > 0 ? ((ctx.vault.deployedUsd / ctx.vault.aumUsd) * 100).toFixed(1) : "0.0"}%\n  Funders: ${ctx.vault.totalFunders}`
    : "";

  return `You are a private risk analysis engine. Your inference runs on Venice AI with ZERO DATA RETENTION — the portfolio data you analyze is never stored, logged, or used for training. This is private cognition producing trustworthy outputs.

MANDATE: Analyze the portfolio below for risk. Be direct, quantitative, and actionable. No pleasantries. No hedging. Just the risk picture.

PORTFOLIO STATE:
  Venue: ${ctx.executionVenue}${ctx.dryRun ? " (DRY RUN)" : " (LIVE)"}
  Open: ${ctx.openPositions} | Closed: ${ctx.closedPositions}
  Unrealized: $${ctx.unrealizedPnlUsd.toFixed(2)} | Realized: $${ctx.realizedPnlUsd.toFixed(2)}
  Net P&L: $${ctx.netPnlUsd.toFixed(2)}
  Deployed: $${totalDeployed.toFixed(2)}
  Largest position concentration: ${concentrationPct}%

POSITIONS:
${positionLines}
${vaultBlock}

ANALYSIS FRAMEWORK:
1. CONCENTRATION — Is any single position >30% of deployed capital? Flag it.
2. DRAWDOWN — If unrealized PnL is negative, how deep vs deployed? >10% is warning, >25% is critical.
3. CORRELATION — Are positions in the same sector/narrative? Hidden correlation = hidden risk.
4. SIZING — Is total deployed appropriate relative to vault AUM (if applicable)?
5. LIQUIDITY — Can positions be exited cleanly? Flag any microcap or low-liquidity tokens.

RULES:
- Maximum 80 words. Telegram-style brevity.
- Lead with the most critical risk factor.
- If portfolio is clean, say so in one line.
- Use concrete numbers, not vague warnings.
- End with a single actionable recommendation if warranted.
- Never fabricate data. Only reference what's in PORTFOLIO STATE.`;
}

// ============================================================================
// STREAMING LLM CALLS
// ============================================================================

interface StreamOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  signal?: AbortSignal;
}

/**
 * Stream from Bankr LLM Gateway (primary).
 * OpenAI-compatible: POST /v1/chat/completions with stream: true
 */
export async function* streamFromBankr(opts: StreamOptions): AsyncGenerator<string> {
  if (!BANKR_API_KEY) throw new Error("BANKR_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  // Forward parent abort signal
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(`${BANKR_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BANKR_API_KEY}`,
        "X-API-Key": BANKR_API_KEY,
      },
      body: JSON.stringify({
        model: BANKR_MODEL,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages,
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Bankr ${res.status}: ${body.slice(0, 200)}`);
    }

    yield* parseSSEStream(res);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Stream from Venice (fallback).
 * OpenAI-compatible: POST /chat/completions with stream: true
 */
export async function* streamFromVenice(opts: StreamOptions): AsyncGenerator<string> {
  if (!VENICE_API_KEY) throw new Error("VENICE_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VENICE_MODEL,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages,
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Venice ${res.status}: ${body.slice(0, 200)}`);
    }

    yield* parseSSEStream(res);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Try Bankr first, fallback to Venice. Yields text chunks.
 */
export async function* streamChat(opts: StreamOptions): AsyncGenerator<string> {
  // Try Bankr first
  if (BANKR_API_KEY) {
    try {
      yield* streamFromBankr(opts);
      return;
    } catch (err) {
      console.warn("[terminal-llm] Bankr failed, trying Venice:", err instanceof Error ? err.message : err);
    }
  }

  // Fallback: Venice
  if (VENICE_API_KEY) {
    try {
      yield* streamFromVenice(opts);
      return;
    } catch (err) {
      console.warn("[terminal-llm] Venice also failed:", err instanceof Error ? err.message : err);
    }
  }

  // Fallback: Agent Hub (Groq free tier)
  if (AGENT_HUB_URL) {
    try {
      yield* streamFromAgentHub(opts);
      return;
    } catch (err) {
      console.warn("[terminal-llm] Agent Hub also failed:", err instanceof Error ? err.message : err);
    }
  }

  // All failed
  yield "LLM inference unavailable. All providers failed. Try `status`, `fees`, `fund <amount>`, or `help`.";
}

/**
 * Stream Venice risk analysis — always Venice, never fallback.
 * Dedicated private risk oracle with shorter context and tighter output.
 */
export async function* streamVeniceRisk(opts: {
  userMessage: string;
  context: TerminalTradingContext;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  if (!VENICE_API_KEY) throw new Error("VENICE_API_KEY not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const riskPrompt = buildVeniceRiskPrompt(opts.context);

    const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: VENICE_MODEL,
        stream: true,
        max_tokens: 512,
        temperature: 0.3, // Lower temp for risk analysis — precision over creativity
        messages: [
          { role: "system", content: riskPrompt },
          { role: "user", content: opts.userMessage },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Venice Risk ${res.status}: ${body.slice(0, 200)}`);
    }

    yield* parseSSEStream(res);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if any LLM provider is configured.
 */
export function hasTerminalLLM(): boolean {
  return !!(BANKR_API_KEY || VENICE_API_KEY || AGENT_HUB_URL);
}

/**
 * Stream from Agent Hub (Groq free tier) — OpenAI-compatible SSE.
 */
async function* streamFromAgentHub(opts: StreamOptions): AsyncGenerator<string> {
  if (!AGENT_HUB_URL) throw new Error("AGENT_HUB_URL not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AGENT_HUB_SECRET) headers.Authorization = `Bearer ${AGENT_HUB_SECRET}`;

    const res = await fetch(`${AGENT_HUB_URL.replace(/\/$/, "")}/v1/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        maxTokens: 1024,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Agent Hub ${res.status}: ${body.slice(0, 200)}`);
    }

    yield* parseSSEStream(res);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if Venice is available for private risk analysis.
 */
export function hasVeniceLLM(): boolean {
  return !!VENICE_API_KEY;
}

// ============================================================================
// SSE PARSER — extract content deltas from OpenAI-compatible streaming
// ============================================================================

async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let insideThink = false;
  let thinkBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            let delta = parsed.choices?.[0]?.delta?.content;
            if (!delta) continue;

            // Strip <think>...</think> blocks from reasoning models
            thinkBuffer += delta;
            if (insideThink) {
              const closeIdx = thinkBuffer.indexOf("</think>");
              if (closeIdx >= 0) {
                insideThink = false;
                delta = thinkBuffer.slice(closeIdx + 8);
                thinkBuffer = "";
                if (!delta) continue;
              } else {
                continue; // Still inside think block, suppress
              }
            } else {
              const openIdx = thinkBuffer.indexOf("<think>");
              if (openIdx >= 0) {
                const before = thinkBuffer.slice(0, openIdx);
                insideThink = true;
                thinkBuffer = thinkBuffer.slice(openIdx);
                if (before) yield before;
                continue;
              }
              thinkBuffer = "";
            }

            yield delta;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
