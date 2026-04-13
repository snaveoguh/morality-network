"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";

const EquityCurve = dynamic(() => import("@/components/pipe/EquityCurve"), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeedItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  category?: string;
}

interface AgentSnapshot {
  id: string;
  name: string;
  description: string;
  status: string;
  lastActivityAt: number | null;
  stats: Record<string, number>;
  errors: string[];
  remote?: boolean;
}

interface SwarmCluster {
  canonicalClaim: string;
  itemCount: number;
  tags: string[];
  sources: string[];
  latestPubDate: string;
  contradictionFlags: { claim: string; counter: string }[];
}

interface TradingSignal {
  symbol: string;
  direction: "bullish" | "bearish";
  score: number;
  observations: number;
  supportingClaims: string[];
}

interface ClosedPosition {
  position: {
    id: string;
    symbol: string;
    direction: "long" | "short";
    entryPrice: number;
    exitPrice: number;
    pnlUsd: number;
    closedAt: number;
    leverage: number;
  };
}

interface OpenPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  leverage: { type: string; value: number };
}

interface BusEvent {
  id: string;
  from: string;
  topic: string;
  payload: unknown;
  timestamp: number;
}

interface PerfData {
  timestamp: number;
  accountValueUsd: number | null;
  openPositionCount: number;
  metrics?: {
    totalTrades?: number;
    winRate?: number;
    sharpeRatio?: number;
    realizedPnlUsd?: number;
  };
}

interface MetricsData {
  performance?: {
    timestamp: number;
    accountValueUsd: number;
    open: OpenPosition[];
    closed: ClosedPosition[];
    totals: {
      openPositions: number;
      closedPositions: number;
      unrealizedPnlUsd: number;
      realizedPnlUsd: number;
      grossPnlUsd: number;
      winRate: number;
      avgWinUsd: number;
      avgLossUsd: number;
    };
    dryRun: boolean;
  };
}

// ─── Pipe Page ───────────────────────────────────────────────────────────────

export default function PipePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [clusters, setClusters] = useState<SwarmCluster[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData["performance"] | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Equity curve data points — accumulate over time
  const [equityHistory, setEquityHistory] = useState<{ time: number; value: number }[]>([]);

  const refresh = useCallback(async () => {
    const [feedRes, agentRes, swarmRes, signalRes, perfRes, metricsRes] =
      await Promise.allSettled([
        fetch("/api/feed?limit=30").then((r) => r.json()),
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/agents/swarm").then((r) => r.json()),
        fetch("/api/trading/signals").then((r) => r.json()),
        fetch("/api/trading/performance").then((r) => r.json()),
        fetch("/api/trading/metrics").then((r) => r.json()),
      ]);

    if (feedRes.status === "fulfilled") setFeed(feedRes.value.items?.slice(0, 30) ?? []);
    if (agentRes.status === "fulfilled") setAgents(agentRes.value.agents ?? []);
    if (swarmRes.status === "fulfilled") setClusters(swarmRes.value.clusters?.slice(0, 15) ?? []);
    if (signalRes.status === "fulfilled") setSignals(signalRes.value.signals?.slice(0, 15) ?? []);
    if (perfRes.status === "fulfilled") {
      setPerf(perfRes.value);
      // Add to equity history
      const val = perfRes.value.accountValueUsd;
      if (typeof val === "number" && val > 0) {
        setEquityHistory((prev) => {
          const next = [...prev, { time: Date.now(), value: val }];
          return next.slice(-200); // keep last 200 points
        });
      }
    }
    if (metricsRes.status === "fulfilled" && metricsRes.value.performance) {
      const m = metricsRes.value.performance;
      setMetrics(m);
      setOpenPositions(m.open ?? []);
      setClosedPositions(m.closed?.slice(0, 20) ?? []);
      // Build equity curve from closed trades if we don't have live data
      if (m.closed?.length > 0 && equityHistory.length === 0) {
        let cumPnl = 0;
        const history = m.closed
          .filter((c: ClosedPosition) => c.position.closedAt > 0)
          .sort((a: ClosedPosition, b: ClosedPosition) => a.position.closedAt - b.position.closedAt)
          .map((c: ClosedPosition) => {
            cumPnl += c.position.pnlUsd;
            return { time: c.position.closedAt, value: cumPnl };
          });
        if (history.length > 0) setEquityHistory(history);
      }
    }
    setLastUpdate(Date.now());
  }, [equityHistory.length]);

  // SSE for real-time agent events
  useEffect(() => {
    const es = new EventSource("/api/agents/events/stream");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "event" && data.event) {
          setEvents((prev) => [data.event, ...prev].slice(0, 50));
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  // Poll every 15s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Derived metrics
  const totalPnl = metrics?.totals.realizedPnlUsd ?? 0;
  const totalTrades = metrics?.totals.closedPositions ?? 0;
  const winRate = metrics?.totals.winRate ?? 0;
  const openCount = openPositions.length;
  const unrealizedPnl = metrics?.totals.unrealizedPnlUsd ?? 0;
  const accountValue = perf?.accountValueUsd ?? metrics?.accountValueUsd ?? 0;
  const isLive = metrics ? !metrics.dryRun : false;

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      {/* ─── Top Metrics Strip ─── */}
      <div className="border-b border-[var(--rule)] bg-[var(--paper-dark)]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-1.5">
          <div className="flex items-center gap-2">
            <PulseIndicator />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
              Pipe
            </span>
            <span className="font-mono text-[7px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              {isLive ? "Live" : "Dry Run"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <MetricPill label="P&L" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? "green" : "red"} />
            <MetricPill label="Trades" value={String(totalTrades)} />
            <MetricPill label="Win" value={`${(winRate * 100).toFixed(0)}%`} color={winRate >= 0.5 ? "green" : "red"} />
            <MetricPill label="Open" value={String(openCount)} />
            <MetricPill label="Agents" value={String(agents.length)} />
            <MetricPill label="Signals" value={String(signals.length)} />
            <MetricPill label="Feeds" value={String(feed.length)} />
            <span className="font-mono text-[7px] text-[var(--ink-faint)]">
              {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Equity Curve ─── */}
      <div className="border-b border-[var(--rule)]">
        <div className="mx-auto max-w-[1600px] px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Net Equity // {isLive ? "Live Session" : "Paper"}
              </span>
              <div className="mt-0.5 font-mono text-2xl font-bold" style={{ color: totalPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
              </div>
              <div className="font-mono text-[8px] text-[var(--ink-faint)]">
                {totalTrades} trades &middot; Account ${accountValue.toFixed(2)}
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="border border-[var(--rule)] px-3 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-dark)] hover:text-[var(--ink)]"
            >
              Refresh
            </button>
          </div>
          <div className="mt-2 h-[180px]">
            <EquityCurve data={equityHistory} />
          </div>
        </div>
      </div>

      {/* ─── 3-Column Dashboard ─── */}
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-0 lg:grid-cols-3">
        {/* Column 1: Scan Log */}
        <div className="border-r border-[var(--rule-light)] lg:border-r">
          <PanelHeader title="Scan Log" subtitle={`${feed.length} items scanned`} />
          <div className="h-[calc(100vh-380px)] overflow-y-auto px-3 py-2 space-y-1">
            {feed.map((item, i) => (
              <ScanLogEntry key={`${item.link}-${i}`} item={item} />
            ))}
            {events.length > 0 && (
              <>
                <div className="border-t border-[var(--rule-light)] pt-2 mt-2">
                  <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)] mb-1">
                    Agent Bus
                  </div>
                </div>
                {events.slice(0, 15).map((ev) => (
                  <BusEventEntry key={ev.id} event={ev} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Column 2: Signals + Narratives */}
        <div className="border-r border-[var(--rule-light)]">
          <PanelHeader title="Edge Scanner" subtitle={`${signals.length} signals / ${clusters.length} clusters`} />
          <div className="h-[calc(100vh-380px)] overflow-y-auto px-3 py-2 space-y-1">
            {signals.map((sig, i) => (
              <SignalEntry key={`sig-${i}`} signal={sig} />
            ))}
            {clusters.length > 0 && (
              <>
                <div className="border-t border-[var(--rule-light)] pt-2 mt-2">
                  <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)] mb-1">
                    Emerging Narratives
                  </div>
                </div>
                {clusters.map((cluster, i) => (
                  <NarrativeEntry key={`cluster-${i}`} cluster={cluster} />
                ))}
              </>
            )}
            {signals.length === 0 && clusters.length === 0 && (
              <EmptyState label="Scanning..." />
            )}
          </div>
        </div>

        {/* Column 3: Active Positions + Agents */}
        <div>
          <PanelHeader title="Active Positions" subtitle={`${openCount} open / $${unrealizedPnl.toFixed(2)} P&L`} />
          <div className="h-[calc(100vh-380px)] overflow-y-auto px-3 py-2 space-y-1">
            {openPositions.map((pos, i) => (
              <PositionEntry key={`open-${i}`} position={pos} />
            ))}
            {openPositions.length === 0 && (
              <div className="border border-[var(--rule-light)] p-3 text-center">
                <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  Flat — Awaiting Signal Consensus
                </span>
              </div>
            )}

            {/* Closed trades */}
            {closedPositions.length > 0 && (
              <>
                <div className="border-t border-[var(--rule-light)] pt-2 mt-3">
                  <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)] mb-1">
                    Recent Closed ({closedPositions.length})
                  </div>
                </div>
                {closedPositions.slice(0, 10).map((row, i) => (
                  <ClosedTradeEntry key={`closed-${i}`} trade={row} />
                ))}
              </>
            )}

            {/* Agents strip */}
            {agents.length > 0 && (
              <>
                <div className="border-t border-[var(--rule-light)] pt-2 mt-3">
                  <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)] mb-1">
                    Agents ({agents.length})
                  </div>
                </div>
                {agents.map((agent) => (
                  <AgentEntry key={agent.id} agent={agent} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UI Components ───────────────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const colorClass =
    color === "green" ? "text-[var(--accent-green)]" :
    color === "red" ? "text-[var(--accent-red)]" :
    "text-[var(--ink)]";
  return (
    <div className="hidden sm:flex items-center gap-1">
      <span className="font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function PulseIndicator() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
    </span>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="sticky top-9 z-10 border-b border-[var(--rule)] bg-[var(--paper)] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
          {title}
        </span>
        <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-16 items-center justify-center">
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">{label}</span>
    </div>
  );
}

// ─── Scan Log Entries ────────────────────────────────────────────────────────

function ScanLogEntry({ item }: { item: FeedItem }) {
  const age = timeAgo(item.pubDate);
  const catColor = item.category === "Crypto" ? "var(--accent-green)" : item.category === "Business" ? "var(--accent-amber)" : "var(--ink-faint)";
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 py-0.5 transition-colors hover:bg-[var(--paper-dark)] -mx-1 px-1">
      <span className="mt-0.5 font-mono text-[7px] uppercase" style={{ color: catColor }}>
        {(item.category ?? "news").slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1 font-mono text-[8px] leading-tight text-[var(--ink)]">
        {item.title}
      </span>
      <span className="shrink-0 font-mono text-[7px] text-[var(--ink-faint)]">{age}</span>
    </a>
  );
}

function BusEventEntry({ event }: { event: BusEvent }) {
  const topicColor =
    event.topic.includes("trade") ? "var(--accent-green)" :
    event.topic.includes("error") ? "var(--accent-red)" :
    "var(--accent-amber)";
  return (
    <div className="flex items-center gap-2 py-0.5 font-mono text-[7px]">
      <span style={{ color: topicColor }} className="uppercase font-bold">{event.topic.slice(0, 12)}</span>
      <span className="text-[var(--ink-faint)]">{event.from}</span>
      <span className="ml-auto text-[var(--ink-faint)]">{timeAgo(new Date(event.timestamp).toISOString())}</span>
    </div>
  );
}

// ─── Signal Entries ──────────────────────────────────────────────────────────

function SignalEntry({ signal }: { signal: TradingSignal }) {
  const isBullish = signal.direction === "bullish";
  const color = isBullish ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <div className="flex items-center gap-2 py-1 border-b border-[var(--rule-light)] last:border-0">
      <span className="font-mono text-[9px] font-bold uppercase" style={{ color }}>
        {isBullish ? "LONG" : "SHRT"}
      </span>
      <span className="font-mono text-[10px] font-bold text-[var(--ink)]">{signal.symbol}</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">EV:{signal.score.toFixed(1)}%</span>
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">{signal.observations} obs</span>
      </div>
    </div>
  );
}

function NarrativeEntry({ cluster }: { cluster: SwarmCluster }) {
  const hasConflict = cluster.contradictionFlags.length > 0;
  return (
    <div className="py-1 border-b border-[var(--rule-light)] last:border-0">
      <div className="font-mono text-[8px] leading-tight text-[var(--ink)]">
        {cluster.canonicalClaim.slice(0, 120)}{cluster.canonicalClaim.length > 120 ? "..." : ""}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">{cluster.itemCount}x</span>
        {hasConflict && <span className="font-mono text-[7px] text-[var(--accent-red)]">CONTESTED</span>}
        {cluster.tags.slice(0, 2).map((t) => (
          <span key={t} className="font-mono text-[6px] uppercase tracking-[0.1em] text-[var(--ink-faint)] bg-[var(--paper-dark)] px-1">{t}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Position Entries ────────────────────────────────────────────────────────

function PositionEntry({ position }: { position: OpenPosition }) {
  const pnl = parseFloat(position.unrealizedPnl);
  const isProfit = pnl >= 0;
  const size = parseFloat(position.szi);
  const isLong = size > 0;
  return (
    <div className="flex items-center gap-2 border border-[var(--rule-light)] p-2">
      <span className="font-mono text-[10px] font-bold text-[var(--ink)]">{position.coin}</span>
      <span className="font-mono text-[8px] font-bold uppercase" style={{ color: isLong ? "var(--accent-green)" : "var(--accent-red)" }}>
        {isLong ? "Long" : "Short"} {position.leverage.value}x
      </span>
      <span className="ml-auto font-mono text-[10px] font-bold" style={{ color: isProfit ? "var(--accent-green)" : "var(--accent-red)" }}>
        {isProfit ? "+" : ""}${pnl.toFixed(2)}
      </span>
    </div>
  );
}

function ClosedTradeEntry({ trade }: { trade: ClosedPosition }) {
  const p = trade.position;
  const isWin = p.pnlUsd >= 0;
  return (
    <div className="flex items-center gap-2 py-0.5 font-mono text-[8px]">
      <span className="font-bold uppercase" style={{ color: isWin ? "var(--accent-green)" : "var(--accent-red)" }}>
        {isWin ? "W" : "L"}
      </span>
      <span className="text-[var(--ink)]">{p.symbol}</span>
      <span className="text-[var(--ink-faint)]">{p.direction} {p.leverage}x</span>
      <span className="ml-auto font-bold" style={{ color: isWin ? "var(--accent-green)" : "var(--accent-red)" }}>
        {isWin ? "+" : ""}${p.pnlUsd.toFixed(2)}
      </span>
    </div>
  );
}

function AgentEntry({ agent }: { agent: AgentSnapshot }) {
  const isOk = agent.status === "running";
  return (
    <div className="flex items-center gap-2 py-0.5 font-mono text-[8px]">
      <span className={`h-1.5 w-1.5 rounded-full ${isOk ? "bg-green-500" : "bg-amber-500"}`} />
      <span className="font-bold uppercase text-[var(--ink)]">{agent.name}</span>
      {agent.remote && <span className="text-[var(--ink-faint)]">remote</span>}
      {agent.errors.length > 0 && <span className="ml-auto text-[var(--accent-red)]">{agent.errors[0].slice(0, 30)}</span>}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
