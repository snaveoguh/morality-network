import "server-only";

import type { TerminalTradingContext, ChatMessage } from "./terminal-types";
export type { TerminalTradingContext, ChatMessage };

// ============================================================================
// TERMINAL LLM — Bankr Gateway (primary) + Venice (fallback) for market chat
//
// Powers the AgentBotTerminal with real LLM inference.
// Bankr LLM Gateway: OpenAI-compatible, 20+ models, onchain economics
// Venice: No-data-retention inference for private portfolio cognition
// ============================================================================

const BANKR_BASE_URL = "https://llm.bankr.bot";
const VENICE_BASE_URL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";

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
    ? ctx.positions.map((p) =>
        `  ${p.symbol}: entry $${p.entryPrice.toFixed(4)}, current ${p.currentPrice !== null ? `$${p.currentPrice.toFixed(4)}` : "n/a"}, unrealized ${p.unrealizedPnl !== null ? `$${p.unrealizedPnl.toFixed(2)}` : "n/a"}, size $${p.size.toFixed(2)}`
      ).join("\n")
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

  // Both failed
  yield "LLM inference unavailable. Both Bankr and Venice providers failed. Try `status`, `fees`, `fund <amount>`, or `help`.";
}

/**
 * Check if any LLM provider is configured.
 */
export function hasTerminalLLM(): boolean {
  return !!(BANKR_API_KEY || VENICE_API_KEY);
}

// ============================================================================
// SSE PARSER — extract content deltas from OpenAI-compatible streaming
// ============================================================================

async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

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
        if (!trimmed || trimmed.startsWith(":")) continue; // Skip empty lines and comments

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
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
