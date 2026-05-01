"use client";

import { useEffect, useRef, useState } from "react";

type LogLevel = "info" | "warn" | "error" | "debug";

interface AgentLogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  meta?: unknown;
}

const MAX_BUFFER = 500;
const LEVEL_FILTERS: ReadonlyArray<{ id: LogLevel | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "info", label: "Info" },
  { id: "warn", label: "Warn" },
  { id: "error", label: "Error" },
];

export function LogViewer() {
  const [entries, setEntries] = useState<AgentLogEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "degraded">(
    "connecting",
  );
  const [levelFilter, setLevelFilter] = useState<LogLevel | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource("/api/agents/logs/stream?historyMs=600000&limit=300");
    setStatus("connecting");

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "connected" | "heartbeat" }
          | { type: "log"; entry: AgentLogEntry }
          | { type: "error"; message?: string };

        if (payload.type === "connected" || payload.type === "heartbeat") {
          setStatus("live");
          return;
        }
        if (payload.type === "error") {
          setStatus("degraded");
          return;
        }
        if (payload.type === "log") {
          setStatus("live");
          if (pausedRef.current) return;
          setEntries((current) => {
            if (current.some((e) => e.id === payload.entry.id)) return current;
            const next = [...current, payload.entry];
            if (next.length > MAX_BUFFER) {
              return next.slice(next.length - MAX_BUFFER);
            }
            return next;
          });
        }
      } catch {
        setStatus("degraded");
      }
    };

    es.onerror = () => setStatus("degraded");
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, autoScroll]);

  const sources = Array.from(new Set(entries.map((e) => e.source))).sort();
  const filtered = entries.filter((e) => {
    if (levelFilter !== "all" && e.level !== levelFilter) return false;
    if (sourceFilter && e.source !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border border-[var(--rule-light)] p-2">
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.2em] ${
            status === "live"
              ? "text-[#2d6a2e]"
              : status === "connecting"
                ? "text-[var(--ink-faint)]"
                : "text-[var(--accent-red)]"
          }`}
        >
          ● {status}
        </span>

        <div className="flex items-center gap-1">
          {LEVEL_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setLevelFilter(f.id)}
              className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] ${
                levelFilter === f.id
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="border border-[var(--rule-light)] bg-transparent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-light)]"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setPaused((p) => !p)}
          className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] ${
            paused
              ? "bg-[var(--accent-red)] text-white"
              : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
          }`}
        >
          {paused ? "Paused" : "Pause"}
        </button>

        <label className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="h-3 w-3"
          />
          Autoscroll
        </label>

        <button
          onClick={() => setEntries([])}
          className="ml-auto px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-faint)] underline hover:text-[var(--ink)]"
        >
          Clear
        </button>

        <span className="font-mono text-[9px] text-[var(--ink-faint)]">
          {filtered.length} / {entries.length}
        </span>
      </div>

      {/* ── Log lines ─────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="h-[60vh] overflow-y-auto border border-[var(--rule-light)] bg-[var(--paper)] p-2 font-mono text-[10px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <p className="text-[var(--ink-faint)]">
            {entries.length === 0
              ? "Waiting for logs..."
              : "No logs match the current filters."}
          </p>
        ) : (
          filtered.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: AgentLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const ts = new Date(entry.ts);
  const time = ts.toLocaleTimeString([], { hour12: false });
  const ms = String(ts.getMilliseconds()).padStart(3, "0");
  const hasMeta = entry.meta !== undefined && entry.meta !== null;

  const levelColor =
    entry.level === "error"
      ? "text-[var(--accent-red)]"
      : entry.level === "warn"
        ? "text-[#b8860b]"
        : entry.level === "debug"
          ? "text-[var(--ink-faint)]"
          : "text-[var(--ink-light)]";

  return (
    <div
      className={`group border-b border-dashed border-[var(--rule-light)]/40 py-0.5 ${
        hasMeta ? "cursor-pointer hover:bg-[var(--paper-tint)]" : ""
      }`}
      onClick={() => hasMeta && setExpanded((v) => !v)}
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-shrink-0 text-[var(--ink-faint)]">
          {time}.{ms}
        </span>
        <span
          className={`flex-shrink-0 font-bold uppercase tracking-wider ${levelColor}`}
        >
          {entry.level}
        </span>
        <span className="flex-shrink-0 text-[#6E9EF5]">{entry.source}</span>
        <span className={`break-all ${levelColor}`}>{entry.message}</span>
        {hasMeta && (
          <span className="ml-auto flex-shrink-0 text-[var(--ink-faint)]">
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expanded && hasMeta && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all bg-[var(--paper-tint)] p-2 text-[9px] text-[var(--ink-light)]">
          {JSON.stringify(entry.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}
