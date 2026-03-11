"use client";

import { useEffect, useMemo, useState } from "react";

type TerminalRole = "assistant" | "user" | "system";

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

interface AgentBotTerminalProps {
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
}

const STORAGE_KEY = "pooter-markets-terminal-v1";
const FREE_MONTHLY_MESSAGES = 30;

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

function makeUserMessage(text: string): TerminalMessage {
  return {
    id: makeId("msg"),
    role: "user",
    text,
    createdAt: Date.now(),
  };
}

function makeSession(title: string): TerminalSession {
  return {
    id: makeId("chat"),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      makeAssistantMessage(
        [
          "gm, how can I help?",
          "Try: `fund 0.01`, `withdraw 0.01`, `status`, `fees`.",
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

function loadState(): { sessions: TerminalSession[]; activeId: string; usage: UsageState } {
  const fallbackSession = makeSession("New Chat");
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
}: AgentBotTerminalProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [makeSession("New Chat")]);
  const [activeId, setActiveId] = useState<string>("");
  const [usage, setUsage] = useState<UsageState>({ monthKey: monthKeyNow(), used: 0 });
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const loaded = loadState();
    setSessions(loaded.sessions);
    setActiveId(loaded.activeId);
    setUsage((prev) => {
      if (loaded.usage.monthKey === monthKeyNow()) return loaded.usage;
      return { monthKey: monthKeyNow(), used: 0 };
    });
  }, []);

  useEffect(() => {
    if (!activeId && sessions[0]) {
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  useEffect(() => {
    if (!activeId || sessions.length === 0) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessions,
        activeId,
        usage,
      })
    );
  }, [sessions, activeId, usage]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [sessions, activeId]
  );
  const monthUsage = usage.monthKey === monthKeyNow() ? usage.used : 0;
  const freeRemaining = Math.max(0, FREE_MONTHLY_MESSAGES - monthUsage);
  const locked = !isUnlocked && freeRemaining <= 0;

  function updateActiveSession(mutator: (session: TerminalSession) => TerminalSession) {
    if (!activeSession) return;
    setSessions((prev) =>
      prev.map((session) => (session.id === activeSession.id ? mutator(session) : session))
    );
  }

  function appendMessage(role: TerminalRole, text: string) {
    updateActiveSession((session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: [
        ...session.messages,
        {
          id: makeId("msg"),
          role,
          text,
          createdAt: Date.now(),
        },
      ],
    }));
  }

  function incrementUsage() {
    setUsage((prev) => {
      const currentMonth = monthKeyNow();
      if (prev.monthKey !== currentMonth) {
        return { monthKey: currentMonth, used: 1 };
      }
      return { ...prev, used: prev.used + 1 };
    });
  }

  function createChat() {
    const next = makeSession(`Chat ${sessions.length + 1}`);
    setSessions((prev) => [next, ...prev]);
    setActiveId(next.id);
  }

  async function handleSend() {
    const command = input.trim();
    if (!command || !activeSession || isBusy) return;

    if (locked) {
      appendMessage(
        "system",
        "Free monthly usage reached. Deposit 50 MO to unlock unlimited terminal access."
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
        appendMessage(
          "assistant",
          `Performance fee is ${feePct.toFixed(2)}% on realized strategy profits.`
        );
        return;
      }

      if (lower === "status" || lower === "/status") {
        appendMessage(
          "assistant",
          [
            `Venue: ${executionVenue}${dryRun ? " (dry-run)" : " (live)"}`,
            `Open positions: ${openPositions}`,
            `Gross PnL: $${grossPnlUsd.toFixed(2)}`,
            `Net PnL: $${netPnlUsd.toFixed(2)}`,
            `Funding: ${fundingAddress}`,
          ].join("\n")
        );
        return;
      }

      if (lower === "help" || lower === "/help") {
        appendMessage(
          "assistant",
          [
            "Commands:",
            "- fund 0.01",
            canWithdraw ? "- withdraw 0.01" : "- withdraw (vault-only)",
            "- status",
            "- fees",
          ].join("\n")
        );
        return;
      }

      appendMessage(
        "assistant",
        "I can run: `fund <amount>`, `withdraw <amount>`, `status`, or `fees`."
      );
    } catch (error) {
      appendMessage(
        "system",
        error instanceof Error ? error.message : "Command failed. Try again."
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnlockClick() {
    if (!onUnlockPlan) {
      appendMessage(
        "assistant",
        "Unlock flow is not wired yet. We can route 50 MO monthly into vault + LP next."
      );
      return;
    }
    setIsBusy(true);
    try {
      const outcome = await onUnlockPlan();
      appendMessage("assistant", outcome);
    } catch (error) {
      appendMessage(
        "system",
        error instanceof Error ? error.message : "Unlock flow failed"
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="border border-[var(--rule-light)]">
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
      </div>

      <div className="max-h-[260px] min-h-[220px] space-y-2 overflow-y-auto bg-[var(--paper-dark)] p-3">
        {activeSession?.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[95%] rounded-sm border p-2 ${
              message.role === "user"
                ? "ml-auto border-[var(--rule)] bg-[var(--paper)]"
                : message.role === "system"
                ? "border-[var(--accent-red)] bg-[var(--paper)] text-[var(--accent-red)]"
                : "border-[var(--rule-light)] bg-[var(--paper)]"
            }`}
          >
            <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[var(--ink)]">
              {message.text}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--rule-light)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p
            className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
              isUnlocked ? "text-emerald-700" : "text-[var(--ink-faint)]"
            }`}
          >
            {isUnlocked
              ? `Unlocked${unlockSummary ? ` — ${unlockSummary}` : ""}`
              : locked
              ? "Usage cap reached"
              : `${freeRemaining} free messages left this month`}
          </p>
          <button
            onClick={handleUnlockClick}
            disabled={isBusy}
            className="border border-[var(--ink)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50"
          >
            Unlock 50 MO / mo
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
            placeholder={locked ? "Unlock to continue..." : "// what's up?"}
            className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-2 font-mono text-[12px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isBusy || locked}
            className="border border-[var(--ink)] bg-[var(--ink)] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--paper)] hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {isBusy ? "..." : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
