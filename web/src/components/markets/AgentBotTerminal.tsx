"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerminalTradingContext } from "@/lib/terminal-types";

type TerminalRole = "assistant" | "user" | "system" | "risk" | "trade";

interface TerminalMessage {
  id: string;
  role: TerminalRole;
  text: string;
  createdAt: number;
}

interface TerminalSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: TerminalMessage[];
}

interface UsageState {
  monthKey: string;
  used: number;
}

export interface AgentBotTerminalProps {
  feePct: number;
  executionVenue: string;
  dryRun: boolean;
  openPositions: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  fundingAddress: string;
  isUnlocked: boolean;
  unlockSummary?: string | null;
  canWithdraw: boolean;
  onFundAmount: (amount: string) => Promise<string>;
  onWithdrawAmount?: (amount: string) => Promise<string>;
  onUnlockPlan?: () => Promise<string>;
  freeAccess?: {
    remaining: number;
    limit: number;
  } | null;
  // Extended trading context for LLM
  tradingContext?: TerminalTradingContext;
}

const STORAGE_KEY = "pooter-markets-terminal-v1";
const FREE_MONTHLY_MESSAGES = 0;

function monthKeyNow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeAssistantMessage(text: string): TerminalMessage {
  return {
    id: makeId("msg"),
    role: "assistant",
    text,
    createdAt: Date.now(),
  };
}

function getFundingSummary(
  canWithdraw: boolean,
  executionVenue: string,
  fundingAddress: string
): string {
  if (canWithdraw) {
    return [
      "Vault mode: `fund` deposits ETH into the vault and mints shares to your wallet.",
      executionVenue === "hyperliquid-perp"
        ? "That still does not automatically top up Hyperliquid margin."
        : "Your address is remembered because the vault tracks shares onchain.",
      executionVenue === "hyperliquid-perp"
        ? "Today the vault share ledger and the live Hyperliquid bankroll are still separate systems."
        : "When the strategy deploys vault capital, your exposure comes through vault shares.",
    ].join("\n");
  }

  return [
    "Direct mode: `fund` sends ETH to the agent wallet only.",
    "It does not create a personal balance or shares for you.",
    executionVenue === "hyperliquid-perp"
      ? "It also does not automatically top up Hyperliquid collateral."
      : `Funds go to ${fundingAddress}.`,
    executionVenue === "hyperliquid-perp"
      ? "So direct Hyperliquid funding is operator bankroll, not your personal vault position."
      : "This is a strategy top-up, not a share-tracked deposit.",
  ].join("\n");
}

function makeSession(title: string, intro?: string): TerminalSession {
  return {
    id: makeId("chat"),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      makeAssistantMessage(
        [
          "gm. desk is live — dual-engine: bankr (strategy) + venice (private risk).",
          "Quick commands: `fund 0.01`, `withdraw 0.01`, `status`, `capital`, `fees`.",
          intro ?? "",
        ].join("\n")
      ),
    ],
  };
}

function parseAmount(command: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function loadState(intro?: string): {
  sessions: TerminalSession[];
  activeId: string;
  usage: UsageState;
} {
  const fallbackSession = makeSession("New Chat", intro);
  const fallback = {
    sessions: [fallbackSession],
    activeId: fallbackSession.id,
    usage: { monthKey: monthKeyNow(), used: 0 },
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<{
      sessions: TerminalSession[];
      activeId: string;
      usage: UsageState;
    }>;

    const sessions =
      Array.isArray(parsed.sessions) && parsed.sessions.length > 0
        ? parsed.sessions
        : fallback.sessions;
    const activeId =
      parsed.activeId && sessions.some((session) => session.id === parsed.activeId)
        ? parsed.activeId
        : sessions[0].id;
    const usage = parsed.usage ?? fallback.usage;

    return { sessions, activeId, usage };
  } catch {
    return fallback;
  }
}

// ============================================================================
// ACTION TAG PARSER — extract [FUND 0.05] etc from LLM responses
// ============================================================================

const ACTION_TAG_RE = /\[(FUND|WITHDRAW|STATUS)\s*([0-9]*\.?[0-9]*)\]/gi;

function parseActionTags(text: string): Array<{ action: string; amount?: string }> {
  const actions: Array<{ action: string; amount?: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = ACTION_TAG_RE.exec(text)) !== null) {
    actions.push({
      action: match[1].toUpperCase(),
      amount: match[2] || undefined,
    });
  }
  ACTION_TAG_RE.lastIndex = 0; // Reset for next call
  return actions;
}

// ============================================================================
// TRADE INTENT DETECTION — detect trade commands from user input or LLM tags
// ============================================================================

const TRADE_PATTERNS = [
  /^(long|short)\s+(\w+)\s*(\d+x)?\s*\$?(\d+\.?\d*)?/i,
  /^(buy|sell)\s+\$?(\d+\.?\d*)?\s*(?:of\s+)?(\w+)\s*(\d+x)?/i,
  /^(open|close)\s+(?:a\s+)?(\d+x\s+)?(long|short)\s+(?:on\s+)?(\w+)\s*(?:worth\s+\$?(\d+\.?\d*))?/i,
];

const TRADE_TAG_RE = /\[TRADE\s+(.+?)\]/gi;

interface ParsedTradeIntent {
  raw: string;
  direction?: "long" | "short";
  asset?: string;
  leverage?: string;
  amount?: string;
}

function parseTradeIntent(text: string): ParsedTradeIntent | null {
  const lower = text.trim().toLowerCase();

  // Pattern 1: "long BTC 40x $50" or "short ETH 10x"
  let match = lower.match(/^(long|short)\s+(\w+)\s*(\d+x)?\s*\$?(\d+\.?\d*)?/i);
  if (match) {
    return {
      raw: text.trim(),
      direction: match[1] as "long" | "short",
      asset: match[2].toUpperCase(),
      leverage: match[3],
      amount: match[4],
    };
  }

  // Pattern 2: "open a 40x long on BTC worth $50"
  match = lower.match(/^open\s+(?:a\s+)?(\d+x\s+)?(long|short)\s+(?:on\s+)?(\w+)\s*(?:worth\s+\$?(\d+\.?\d*))?/i);
  if (match) {
    return {
      raw: text.trim(),
      direction: match[2] as "long" | "short",
      asset: match[3].toUpperCase(),
      leverage: match[1]?.trim(),
      amount: match[4],
    };
  }

  // Pattern 3: "close BTC" or "close my BTC position"
  match = lower.match(/^close\s+(?:my\s+)?(\w+)\s*(?:position)?/i);
  if (match) {
    return {
      raw: text.trim(),
      asset: match[1].toUpperCase(),
    };
  }

  return null;
}

function parseTradeTagsFromResponse(text: string): string[] {
  const trades: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TRADE_TAG_RE.exec(text)) !== null) {
    trades.push(match[1]);
  }
  TRADE_TAG_RE.lastIndex = 0;
  return trades;
}

// ============================================================================
// BANKR API KEY STORAGE — localStorage, never server-persisted
// ============================================================================

const BANKR_KEY_STORAGE = "pooter:bankr-api-key";

function loadBankrKey(): string {
  try {
    return localStorage.getItem(BANKR_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function saveBankrKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(BANKR_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(BANKR_KEY_STORAGE);
    }
  } catch {}
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentBotTerminal({
  feePct,
  executionVenue,
  dryRun,
  openPositions,
  grossPnlUsd,
  netPnlUsd,
  fundingAddress,
  isUnlocked,
  unlockSummary,
  canWithdraw,
  onFundAmount,
  onWithdrawAmount,
  onUnlockPlan,
  freeAccess,
  tradingContext,
}: AgentBotTerminalProps) {
  const fundingSummary = getFundingSummary(canWithdraw, executionVenue, fundingAddress);
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [
    makeSession("New Chat", fundingSummary),
  ]);
  const [activeId, setActiveId] = useState<string>("");
  const [usage, setUsage] = useState<UsageState>({ monthKey: monthKeyNow(), used: 0 });
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamingRiskId, setStreamingRiskId] = useState<string | null>(null);
  const [freeRemainingServer, setFreeRemainingServer] = useState<number | null>(
    freeAccess?.remaining ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Bankr connection state ──
  const [bankrKey, setBankrKey] = useState<string>("");
  const [showBankrInput, setShowBankrInput] = useState(false);
  const [bankrKeyDraft, setBankrKeyDraft] = useState("");
  const [pendingTrade, setPendingTrade] = useState<ParsedTradeIntent | null>(null);
  const [tradeExecuting, setTradeExecuting] = useState(false);
  const bankrConnected = bankrKey.length > 10;

  useEffect(() => {
    const loaded = loadState(fundingSummary);
    setSessions(loaded.sessions);
    setActiveId(loaded.activeId);
    setUsage((prev) => {
      if (loaded.usage.monthKey === monthKeyNow()) return loaded.usage;
      return { monthKey: monthKeyNow(), used: 0 };
    });
    setBankrKey(loadBankrKey());
  }, [fundingSummary]);

  useEffect(() => {
    if (!activeId && sessions[0]) {
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  useEffect(() => {
    setFreeRemainingServer(
      typeof freeAccess?.remaining === "number" ? freeAccess.remaining : null,
    );
  }, [freeAccess?.remaining]);

  useEffect(() => {
    if (!activeId || sessions.length === 0) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessions, activeId, usage })
    );
  }, [sessions, activeId, usage]);

  // Auto-scroll on new messages / streaming updates
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [sessions, streamingMsgId, streamingRiskId]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [sessions, activeId]
  );
  const monthUsage = usage.monthKey === monthKeyNow() ? usage.used : 0;
  const freeRemaining = freeRemainingServer ?? Math.max(0, FREE_MONTHLY_MESSAGES - monthUsage);
  const freeLimit = freeAccess?.limit ?? FREE_MONTHLY_MESSAGES;
  const freeTierEnabled = freeLimit > 0;
  const locked = !isUnlocked && (!freeTierEnabled || freeRemaining <= 0);

  function updateActiveSession(mutator: (session: TerminalSession) => TerminalSession) {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((session) => (session.id === activeSession.id ? mutator(session) : session))
    );
  }

  function appendMessage(role: TerminalRole, text: string): string {
    const id = makeId("msg");
    updateActiveSession((session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: [...session.messages, { id, role, text, createdAt: Date.now() }],
    }));
    return id;
  }

  /** Remove a message by id (used to clean up empty Venice placeholders) */
  function removeMessage(msgId: string) {
    setSessions((prev) =>
      prev.map((session) => ({
        ...session,
        messages: session.messages.filter((msg) => msg.id !== msgId),
      }))
    );
  }

  /** Update text of a specific message (for streaming) */
  const updateMessageText = useCallback((msgId: string, text: string) => {
    setSessions((prev) =>
      prev.map((session) => ({
        ...session,
        messages: session.messages.map((msg) =>
          msg.id === msgId ? { ...msg, text } : msg
        ),
      }))
    );
  }, []);

  function incrementUsage() {
    if (freeRemainingServer !== null) {
      setFreeRemainingServer((prev) => (prev === null ? null : Math.max(0, prev - 1)));
      return;
    }
    setUsage((prev) => {
      const currentMonth = monthKeyNow();
      if (prev.monthKey !== currentMonth) {
        return { monthKey: currentMonth, used: 1 };
      }
      return { ...prev, used: prev.used + 1 };
    });
  }

  function createChat() {
    const next = makeSession(`Chat ${sessions.length + 1}`, fundingSummary);
    setSessions((prev) => [next, ...prev]);
    setActiveId(next.id);
  }

  // Build default trading context from props if not provided
  const resolvedContext: TerminalTradingContext = tradingContext ?? {
    executionVenue,
    dryRun,
    feePct,
    fundingAddress,
    canWithdraw,
    openPositions,
    closedPositions: 0,
    grossPnlUsd,
    netPnlUsd,
    unrealizedPnlUsd: 0,
    realizedPnlUsd: 0,
    deployedUsd: 0,
    positions: [],
  };

  // ========================================================================
  // SSE STREAM READER — shared between Bankr and Venice streams
  // ========================================================================

  async function consumeSSEStream(
    res: Response,
    msgId: string,
  ): Promise<string> {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.done) break;
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.token) {
            fullText += parsed.token;
            updateMessageText(msgId, fullText);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
            if (data !== "[DONE]") throw e;
          }
        }
      }
    }

    return fullText;
  }

  // ========================================================================
  // STREAM LLM RESPONSE — dual-engine: Bankr (desk) + Venice (risk oracle)
  // ========================================================================

  async function streamLLMResponse(userText: string) {
    // Build message history for the LLM (last 20 messages)
    const history = (activeSession?.messages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-18)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    // Add the new user message
    history.push({ role: "user" as const, content: userText });

    // Create placeholder messages — Bankr response + Venice risk analysis
    const assistantMsgId = makeId("msg");
    const riskMsgId = makeId("risk");

    updateActiveSession((session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: [
        ...session.messages,
        { id: assistantMsgId, role: "assistant" as TerminalRole, text: "", createdAt: Date.now() },
        { id: riskMsgId, role: "risk" as TerminalRole, text: "", createdAt: Date.now() },
      ],
    }));
    setStreamingMsgId(assistantMsgId);
    setStreamingRiskId(riskMsgId);

    const controller = new AbortController();
    abortRef.current = controller;

    let bankrText = "";

    try {
      // Fire BOTH providers in parallel
      const bankrPromise = fetch("/api/terminal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: resolvedContext }),
        signal: controller.signal,
      });

      const venicePromise = fetch("/api/terminal/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: userText, context: resolvedContext }),
        signal: controller.signal,
      }).catch(() => null); // Venice failure is non-fatal

      // Start consuming Bankr stream immediately
      const bankrRes = await bankrPromise;
      if (!bankrRes.ok) {
        const errText = await bankrRes.text().catch(() => "");
        let parsedError: string | null = null;
        try {
          const parsed = JSON.parse(errText) as { error?: string; freeAccess?: { remaining?: number } };
          if (typeof parsed.freeAccess?.remaining === "number") {
            setFreeRemainingServer(parsed.freeAccess.remaining);
          }
          parsedError = parsed.error || null;
        } catch {
          parsedError = parsedError ?? null;
        }
        throw new Error(parsedError || errText || `HTTP ${bankrRes.status}`);
      }

      // Consume both streams concurrently
      const bankrStreamPromise = consumeSSEStream(bankrRes, assistantMsgId);

      // Venice stream — consume independently, failures are silent
      const veniceStreamPromise = (async () => {
        try {
          const veniceRes = await venicePromise;
          if (!veniceRes || !veniceRes.ok) {
            removeMessage(riskMsgId);
            setStreamingRiskId(null);
            return "";
          }
          return await consumeSSEStream(veniceRes, riskMsgId);
        } catch {
          removeMessage(riskMsgId);
          setStreamingRiskId(null);
          return "";
        }
      })();

      // Await both
      const [bankrResult, veniceResult] = await Promise.all([
        bankrStreamPromise,
        veniceStreamPromise,
      ]);

      bankrText = bankrResult;

      // If Venice returned empty, remove the placeholder
      if (!veniceResult) {
        removeMessage(riskMsgId);
      }

      // After streaming completes, check for action tags in Bankr response
      const actions = parseActionTags(bankrText);
      for (const action of actions) {
        if (action.action === "FUND" && action.amount) {
          try {
            const outcome = await onFundAmount(action.amount);
            appendMessage("assistant", outcome);
          } catch (err) {
            appendMessage("system", err instanceof Error ? err.message : "Fund action failed");
          }
        } else if (action.action === "WITHDRAW" && action.amount) {
          if (canWithdraw && onWithdrawAmount) {
            try {
              const outcome = await onWithdrawAmount(action.amount);
              appendMessage("assistant", outcome);
            } catch (err) {
              appendMessage("system", err instanceof Error ? err.message : "Withdraw action failed");
            }
          }
        }
      }

      // Check for TRADE tags from LLM response
      const tradeTags = parseTradeTagsFromResponse(bankrText);
      if (tradeTags.length > 0 && bankrConnected) {
        // Show confirmation for the first trade suggestion
        const tradeIntent = parseTradeIntent(tradeTags[0]);
        if (tradeIntent) {
          setPendingTrade(tradeIntent);
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "LLM request failed";
      if (!bankrText) {
        updateMessageText(assistantMsgId, `[error] ${msg}`);
      } else {
        appendMessage("system", msg);
      }
      // Clean up Venice placeholder on error
      removeMessage(riskMsgId);
    } finally {
      setStreamingMsgId(null);
      setStreamingRiskId(null);
      abortRef.current = null;
    }
  }

  // ========================================================================
  // BANKR TRADE EXECUTION — submit trade via Bankr Agent API
  // ========================================================================

  async function executeBankrTrade(prompt: string) {
    if (!bankrKey) {
      appendMessage("system", "Connect your Bankr API key to trade. Click 'Connect Bankr' above.");
      return;
    }

    setTradeExecuting(true);
    const tradeMsgId = appendMessage("trade", `⏳ Submitting to Bankr: "${prompt}"`);

    try {
      const res = await fetch("/api/terminal/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankrApiKey: bankrKey,
          prompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Trade request failed" }));
        updateMessageText(tradeMsgId, `✗ ${(err as { error?: string }).error || "Trade failed"}`);
        return;
      }

      // Consume SSE stream for trade updates
      const reader = res.body?.getReader();
      if (!reader) {
        updateMessageText(tradeMsgId, "✗ No response from trade endpoint");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalStatus = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6)) as {
              status: string;
              message?: string;
              response?: string;
              error?: string;
              jobId?: string;
              done?: boolean;
            };

            if (data.status === "completed") {
              finalStatus = `✓ ${data.response || data.message || "Trade completed"}`;
              updateMessageText(tradeMsgId, finalStatus);
            } else if (data.status === "failed") {
              finalStatus = `✗ ${data.error || data.message || "Trade failed"}`;
              updateMessageText(tradeMsgId, finalStatus);
            } else if (data.status === "cancelled") {
              finalStatus = `⊘ Trade cancelled`;
              updateMessageText(tradeMsgId, finalStatus);
            } else {
              // Processing update
              updateMessageText(tradeMsgId, `⏳ ${data.message || `${data.status}...`}`);
            }
          } catch {
            // skip malformed
          }
        }
      }

      if (!finalStatus) {
        updateMessageText(tradeMsgId, "✗ Trade timed out — check Bankr for status");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Trade execution failed";
      updateMessageText(tradeMsgId, `✗ ${msg}`);
    } finally {
      setTradeExecuting(false);
      setPendingTrade(null);
    }
  }

  function handleConfirmTrade() {
    if (!pendingTrade) return;
    // Build a natural language prompt for Bankr
    const parts = [];
    if (pendingTrade.direction) {
      parts.push(`open a`);
      if (pendingTrade.leverage) parts.push(pendingTrade.leverage);
      parts.push(pendingTrade.direction);
      if (pendingTrade.asset) parts.push(`on ${pendingTrade.asset}`);
      if (pendingTrade.amount) parts.push(`worth $${pendingTrade.amount}`);
      parts.push(`on hyperliquid`);
    } else {
      // Close command
      parts.push(pendingTrade.raw);
    }
    const prompt = parts.join(" ");
    setPendingTrade(null);
    void executeBankrTrade(prompt);
  }

  function handleCancelTrade() {
    setPendingTrade(null);
    appendMessage("system", "Trade cancelled.");
  }

  // ========================================================================
  // HANDLE SEND — fast-path commands or LLM streaming
  // ========================================================================

  async function handleSend() {
    const command = input.trim();
    if (!command || !activeSession || isBusy) return;

    if (locked) {
      appendMessage(
        "system",
        "Hold 100,000 MO in a verified wallet to unlock the terminal.",
      );
      setInput("");
      return;
    }

    appendMessage("user", command);
    incrementUsage();
    setInput("");
    setIsBusy(true);

    try {
      const lower = command.toLowerCase();

      // Fast-path: direct commands (no LLM call)
      const fundAmount = parseAmount(lower, [
        /^(?:\/)?(?:fund|deposit|send)\s+\$?([0-9]+(?:\.[0-9]+)?)\b/,
        /^(?:\/)?buy\s+\$?([0-9]+(?:\.[0-9]+)?)\b/,
      ]);
      const withdrawAmount = parseAmount(lower, [
        /^(?:\/)?withdraw\s+\$?([0-9]+(?:\.[0-9]+)?)\b/,
      ]);

      if (fundAmount) {
        const outcome = await onFundAmount(fundAmount);
        appendMessage("assistant", outcome);
        return;
      }

      if (withdrawAmount) {
        if (!canWithdraw || !onWithdrawAmount) {
          appendMessage("assistant", "Withdrawals are only available when vault mode is enabled.");
          return;
        }
        const outcome = await onWithdrawAmount(withdrawAmount);
        appendMessage("assistant", outcome);
        return;
      }

      if (lower === "fees" || lower === "/fees") {
        appendMessage("assistant", `Performance fee is ${feePct.toFixed(2)}% on realized strategy profits.`);
        return;
      }

      if (lower === "status" || lower === "/status") {
        appendMessage("assistant", [
          `Venue: ${executionVenue}${dryRun ? " (dry-run)" : " (live)"}`,
          `Open positions: ${openPositions}`,
          `Gross PnL: $${grossPnlUsd.toFixed(2)}`,
          `Net PnL: $${netPnlUsd.toFixed(2)}`,
          `Funding: ${fundingAddress}`,
          `Funding mode: ${canWithdraw ? "vault shares tracked to your wallet" : "direct wallet transfer, not credited per-user"}`,
        ].join("\n"));
        return;
      }

      if (lower === "capital" || lower === "/capital") {
        appendMessage("assistant", [
          canWithdraw
            ? "Ownership: vault deposits mint onchain shares to your wallet."
            : "Ownership: direct funding does not mint shares or track a personal balance for you.",
          executionVenue === "hyperliquid-perp"
            ? (canWithdraw
              ? "Hyperliquid margin is still a separate rail today, so vault shares do not automatically become HL collateral."
              : "If you fund the HL bot directly, that capital is operator-controlled bankroll.")
            : (canWithdraw
              ? "If strategy capital is deployed, your exposure is through vault shares rather than a personal trading account."
              : `Funds route to ${fundingAddress}.`),
          openPositions > 0
            ? `Current state: ${openPositions} live position${openPositions === 1 ? "" : "s"} open.`
            : "Current state: live but flat right now with 0 open positions.",
        ].join("\n"));
        return;
      }

      if (lower === "help" || lower === "/help") {
        appendMessage("assistant", [
          "Commands:",
          "- fund 0.01",
          canWithdraw ? "- withdraw 0.01" : "- withdraw (vault-only)",
          "- status",
          "- capital",
          "- fees",
          "",
          "Or ask me anything about your positions, risk, strategy, or market conditions.",
          "Dual-engine: Bankr handles strategy, Venice provides private risk analysis.",
          "",
          fundingSummary,
        ].join("\n"));
        return;
      }

      // Check for trade intent (if Bankr is connected)
      const tradeIntent = parseTradeIntent(command);
      if (tradeIntent && bankrConnected) {
        setPendingTrade(tradeIntent);
        setIsBusy(false);
        return;
      }
      if (tradeIntent && !bankrConnected) {
        appendMessage("system", "Connect your Bankr API key to execute trades. Click 'Connect Bankr' above.");
        setIsBusy(false);
        return;
      }

      // Not a built-in command — route to dual-engine LLM
      await streamLLMResponse(command);
    } catch (error) {
      appendMessage("system", error instanceof Error ? error.message : "Command failed. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnlockClick() {
    if (!onUnlockPlan) {
      appendMessage(
        "assistant",
        "Full terminal access unlocks for wallets holding 100,000 MO after wallet verification.",
      );
      return;
    }
    setIsBusy(true);
    try {
      const outcome = await onUnlockPlan();
      appendMessage("assistant", outcome);
    } catch (error) {
      appendMessage("system", error instanceof Error ? error.message : "Unlock flow failed");
    } finally {
      setIsBusy(false);
    }
  }

  // ========================================================================
  // MESSAGE STYLING — distinct rendering for each provider
  // ========================================================================

  function getMessageClasses(message: TerminalMessage): string {
    switch (message.role) {
      case "user":
        return "ml-auto border-[var(--rule)] bg-[var(--paper)]";
      case "risk":
        // Venice risk analysis — dashed border, subtle distinct background
        return "border-dashed border-[var(--ink-faint)] bg-[var(--paper)]";
      case "trade":
        // Trade execution — accent border
        return message.text.startsWith("✓")
          ? "border-emerald-600 bg-[var(--paper)]"
          : message.text.startsWith("✗")
          ? "border-[var(--accent-red)] bg-[var(--paper)]"
          : "border-[var(--ink-faint)] bg-[var(--paper)]";
      case "system":
        return "border-[var(--accent-red)] bg-[var(--paper)] text-[var(--accent-red)]";
      default:
        // Bankr assistant
        return "border-[var(--rule-light)] bg-[var(--paper)]";
    }
  }

  return (
    <section className="border border-[var(--rule-light)]">
      {/* Header bar — shows both providers */}
      <div className="flex items-center gap-1 border-b border-[var(--rule-light)] px-2 py-1">
        <button
          onClick={createChat}
          className="border border-[var(--rule-light)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink)] hover:bg-[var(--paper-dark)]"
        >
          + New Chat
        </button>
        <div className="ml-2 flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveId(session.id)}
              className={`shrink-0 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
                activeSession?.id === session.id
                  ? "border-[var(--rule)] bg-[var(--paper-dark)] text-[var(--ink)]"
                  : "border-[var(--rule-light)] text-[var(--ink-faint)] hover:bg-[var(--paper-dark)]"
              }`}
            >
              {session.title}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            bankr
          </span>
          <span className="font-mono text-[7px] text-[var(--ink-faint)]">·</span>
          <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            venice
          </span>
        </div>
      </div>

      {/* Message area */}
      <div
        ref={scrollRef}
        className="max-h-[320px] min-h-[220px] space-y-2 overflow-y-auto bg-[var(--paper-dark)] p-3"
      >
        {activeSession?.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[95%] rounded-sm border p-2 ${getMessageClasses(message)}`}
          >
            {/* Venice risk label */}
            {message.role === "risk" && (
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  venice · private risk analysis
                </span>
              </div>
            )}
            {/* Trade execution label */}
            {message.role === "trade" && (
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  bankr · trade execution
                </span>
              </div>
            )}

            <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[var(--ink)]">
              {message.text}
              {/* Bankr streaming cursor */}
              {streamingMsgId === message.id && (
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--ink)]" />
              )}
              {/* Venice streaming cursor */}
              {streamingRiskId === message.id && (
                <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--ink-faint)]" />
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Trade confirmation card */}
      {pendingTrade && (
        <div className="border-t border-[var(--rule-light)] bg-[var(--paper-dark)] p-3">
          <div className="border border-[var(--rule)] p-3">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              ⚡ Trade Confirmation
            </p>
            <p className="mb-1 font-mono text-[12px] font-bold text-[var(--ink)]">
              {pendingTrade.direction?.toUpperCase() || "CLOSE"} {pendingTrade.asset || ""}
              {pendingTrade.leverage ? ` @ ${pendingTrade.leverage}` : ""}
              {pendingTrade.amount ? ` — $${pendingTrade.amount}` : ""}
            </p>
            <p className="mb-3 font-mono text-[9px] text-[var(--ink-faint)]">
              Via Bankr Agent API → Your Bankr wallet on Hyperliquid
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmTrade}
                disabled={tradeExecuting}
                className="border border-emerald-700 bg-emerald-700 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={handleCancelTrade}
                disabled={tradeExecuting}
                className="border border-[var(--rule)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink)] hover:bg-[var(--paper-dark)] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--rule-light)] p-3">
        {/* Bankr connection — inline above input */}
        <div className="mb-2 flex items-center gap-2">
          {!bankrConnected ? (
            showBankrInput ? (
              <div className="flex flex-1 items-center gap-1">
                <input
                  value={bankrKeyDraft}
                  onChange={(e) => setBankrKeyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && bankrKeyDraft.length > 10) {
                      saveBankrKey(bankrKeyDraft);
                      setBankrKey(bankrKeyDraft);
                      setBankrKeyDraft("");
                      setShowBankrInput(false);
                    }
                    if (e.key === "Escape") {
                      setShowBankrInput(false);
                      setBankrKeyDraft("");
                    }
                  }}
                  placeholder="Paste Bankr API key..."
                  className="flex-1 border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
                  type="password"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (bankrKeyDraft.length > 10) {
                      saveBankrKey(bankrKeyDraft);
                      setBankrKey(bankrKeyDraft);
                      setBankrKeyDraft("");
                      setShowBankrInput(false);
                    }
                  }}
                  className="border border-[var(--ink)] px-2 py-1 font-mono text-[8px] uppercase text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                >
                  Save
                </button>
                <button
                  onClick={() => { setShowBankrInput(false); setBankrKeyDraft(""); }}
                  className="px-1 font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBankrInput(true)}
                className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--ink)]"
              >
                Connect Bankr to trade
              </button>
            )
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-700">
                Bankr ✓ {maskKey(bankrKey)}
              </span>
              <button
                onClick={() => {
                  saveBankrKey("");
                  setBankrKey("");
                }}
                className="font-mono text-[8px] uppercase text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--accent-red)]"
              >
                Disconnect
              </button>
            </div>
          )}
          <a
            href="https://docs.bankr.bot/agent-api/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--ink)]"
          >
            Docs
          </a>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2">
          <p
            className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
              isUnlocked ? "text-emerald-700" : "text-[var(--ink-faint)]"
            }`}
          >
            {isUnlocked
              ? `Unlocked${unlockSummary ? ` — ${unlockSummary}` : ""}`
              : locked
              ? unlockSummary || "Hold 100k MO and verify the wallet to unlock the terminal"
              : `${freeRemaining} free messages left this month (${freeLimit} total)`}
          </p>
          <button
            onClick={handleUnlockClick}
            disabled={isBusy}
            className="border border-[var(--ink)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
          >
            Hold 100k MO For Full Access
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={
              locked
                ? "Hold 100k MO and verify wallet to continue..."
                : bankrConnected
                ? "Trade or ask anything... (e.g. 'long BTC 40x')"
                : "ask about positions, risk, strategy..."
            }
            className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-2 font-mono text-[12px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isBusy || locked || tradeExecuting}
            className="border border-[var(--ink)] bg-[var(--ink)] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--paper)] hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {isBusy || tradeExecuting ? "..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
