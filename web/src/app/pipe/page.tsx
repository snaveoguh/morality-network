"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

interface Position {
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

// ─── Pipeline Page ───────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [clusters, setClusters] = useState<SwarmCluster[]>([]);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [performance, setPerformance] = useState<{
    accountValueUsd: number | null;
    openPositionCount: number;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch all panel data
  const refresh = useCallback(async () => {
    const [feedRes, agentRes, swarmRes, signalRes, posRes, perfRes] =
      await Promise.allSettled([
        fetch("/api/feed?limit=20").then((r) => r.json()),
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/agents/swarm").then((r) => r.json()),
        fetch("/api/trading/signals").then((r) => r.json()),
        fetch("/api/trading/positions").then((r) => r.json()),
        fetch("/api/trading/performance").then((r) => r.json()),
      ]);

    if (feedRes.status === "fulfilled") setFeed(feedRes.value.items?.slice(0, 20) ?? []);
    if (agentRes.status === "fulfilled") setAgents(agentRes.value.agents ?? []);
    if (swarmRes.status === "fulfilled") setClusters(swarmRes.value.clusters?.slice(0, 12) ?? []);
    if (signalRes.status === "fulfilled") setSignals(signalRes.value.signals?.slice(0, 12) ?? []);
    if (posRes.status === "fulfilled") setPositions(posRes.value.positions ?? []);
    if (perfRes.status === "fulfilled") setPerformance(perfRes.value);
    setLastUpdate(Date.now());
  }, []);

  // SSE for real-time agent events
  useEffect(() => {
    const es = new EventSource("/api/agents/events/stream");
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "event" && data.event) {
          setEvents((prev) => [data.event, ...prev].slice(0, 30));
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, []);

  // Poll every 30s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      {/* Header bar */}
      <div className="border-b border-[var(--rule)] px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <div>
            <h1 className="font-headline text-lg tracking-tight text-[var(--ink)]">
              The Engine
            </h1>
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Data Feeds &rarr; Agents &rarr; Narratives &rarr; Trades
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PulseIndicator />
            <span className="font-mono text-[8px] text-[var(--ink-faint)]">
              {new Date(lastUpdate).toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={refresh}
              className="border border-[var(--rule)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-dark)] hover:text-[var(--ink)]"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* 4-column pipeline */}
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-0 md:grid-cols-2 xl:grid-cols-4">
        <PipelineColumn
          title="Data Feeds"
          subtitle={`${feed.length} items`}
          step={1}
        >
          {feed.map((item, i) => (
            <FeedCard key={`${item.link}-${i}`} item={item} />
          ))}
          {feed.length === 0 && <EmptyState label="No feed items" />}
        </PipelineColumn>

        <PipelineColumn
          title="Agents"
          subtitle={`${agents.length} active`}
          step={2}
        >
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          {events.length > 0 && (
            <div className="mt-2 border-t border-[var(--rule-light)] pt-2">
              <div className="mb-1 font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Live Bus
              </div>
              {events.slice(0, 8).map((ev) => (
                <EventCard key={ev.id} event={ev} />
              ))}
            </div>
          )}
          {agents.length === 0 && <EmptyState label="No agents reporting" />}
        </PipelineColumn>

        <PipelineColumn
          title="Narratives"
          subtitle={`${clusters.length} clusters / ${signals.length} signals`}
          step={3}
        >
          {clusters.map((cluster, i) => (
            <ClusterCard key={`cluster-${i}`} cluster={cluster} />
          ))}
          {signals.length > 0 && (
            <div className="mt-2 border-t border-[var(--rule-light)] pt-2">
              <div className="mb-1 font-mono text-[7px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Trading Signals
              </div>
              {signals.map((sig, i) => (
                <SignalCard key={`sig-${i}`} signal={sig} />
              ))}
            </div>
          )}
          {clusters.length === 0 && signals.length === 0 && (
            <EmptyState label="No narratives forming" />
          )}
        </PipelineColumn>

        <PipelineColumn
          title="Trades"
          subtitle={
            performance
              ? `$${performance.accountValueUsd?.toFixed(2) ?? "?"} / ${performance.openPositionCount} open`
              : "loading..."
          }
          step={4}
        >
          {positions.map((pos, i) => (
            <PositionCard key={`pos-${i}`} position={pos} />
          ))}
          {positions.length === 0 && (
            <EmptyState label="No open positions" />
          )}
        </PipelineColumn>
      </div>
    </div>
  );
}

// ─── Layout Components ───────────────────────────────────────────────────────

function PipelineColumn({
  title,
  subtitle,
  step,
  children,
}: {
  title: string;
  subtitle: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col border-r border-[var(--rule-light)] last:border-r-0">
      <div className="sticky top-9 z-10 border-b border-[var(--rule)] bg-[var(--paper)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center bg-[var(--ink)] font-mono text-[8px] font-bold text-[var(--paper)]">
            {step}
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
            {title}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[7px] tracking-[0.1em] text-[var(--ink-faint)]">
          {subtitle}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {children}
      </div>
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-20 items-center justify-center">
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {label}
      </span>
    </div>
  );
}

// ─── Card Components ─────────────────────────────────────────────────────────

function FeedCard({ item }: { item: FeedItem }) {
  const age = timeAgo(item.pubDate);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-[var(--rule-light)] p-2 transition-colors hover:bg-[var(--paper-dark)]"
    >
      <div className="font-mono text-[9px] leading-tight text-[var(--ink)]">
        {item.title}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
          {item.source}
        </span>
        {item.category && (
          <span className="bg-[var(--paper-dark)] px-1 font-mono text-[6px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            {item.category}
          </span>
        )}
        <span className="ml-auto font-mono text-[7px] text-[var(--ink-faint)]">
          {age}
        </span>
      </div>
    </a>
  );
}

function AgentCard({ agent }: { agent: AgentSnapshot }) {
  const isHealthy = agent.status === "running";
  return (
    <div className="border border-[var(--rule-light)] p-2">
      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-amber-500"}`}
        />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
          {agent.name}
        </span>
        {agent.remote && (
          <span className="bg-[var(--paper-dark)] px-1 font-mono text-[6px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            Remote
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[7px] text-[var(--ink-faint)]">
        {agent.description}
      </div>
      {Object.keys(agent.stats).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(agent.stats).slice(0, 4).map(([k, v]) => (
            <span key={k} className="font-mono text-[7px] text-[var(--ink-faint)]">
              {k}: <span className="text-[var(--ink)]">{v}</span>
            </span>
          ))}
        </div>
      )}
      {agent.errors.length > 0 && (
        <div className="mt-1 font-mono text-[7px] text-[var(--accent-red)]">
          {agent.errors[0]}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: BusEvent }) {
  return (
    <div className="border-l-2 border-[var(--rule-light)] py-0.5 pl-2 font-mono text-[7px]">
      <span className="text-[var(--ink-faint)]">{event.from}</span>
      <span className="mx-1 text-[var(--rule)]">&rarr;</span>
      <span className="uppercase tracking-[0.1em] text-[var(--ink)]">
        {event.topic}
      </span>
      <span className="ml-1 text-[var(--ink-faint)]">
        {timeAgo(new Date(event.timestamp).toISOString())}
      </span>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: SwarmCluster }) {
  const hasContradiction = cluster.contradictionFlags.length > 0;
  return (
    <div className="border border-[var(--rule-light)] p-2">
      <div className="font-mono text-[9px] leading-tight text-[var(--ink)]">
        {cluster.canonicalClaim}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">
          {cluster.itemCount} sources
        </span>
        {hasContradiction && (
          <span className="font-mono text-[7px] text-[var(--accent-red)]">
            {cluster.contradictionFlags.length} contradiction{cluster.contradictionFlags.length !== 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {cluster.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-[var(--paper-dark)] px-1 font-mono text-[6px] uppercase tracking-[0.14em] text-[var(--ink-faint)]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: TradingSignal }) {
  const isBullish = signal.direction === "bullish";
  return (
    <div className="flex items-center gap-2 border-l-2 py-0.5 pl-2"
      style={{ borderColor: isBullish ? "var(--accent-green)" : "var(--accent-red)" }}
    >
      <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
        {signal.symbol}
      </span>
      <span
        className="font-mono text-[8px] font-bold uppercase"
        style={{ color: isBullish ? "var(--accent-green)" : "var(--accent-red)" }}
      >
        {signal.direction}
      </span>
      <span className="font-mono text-[7px] text-[var(--ink-faint)]">
        {signal.score.toFixed(2)}
      </span>
      <span className="ml-auto font-mono text-[7px] text-[var(--ink-faint)]">
        {signal.observations} obs
      </span>
    </div>
  );
}

function PositionCard({ position }: { position: Position }) {
  const pnl = parseFloat(position.unrealizedPnl);
  const isProfit = pnl >= 0;
  const size = parseFloat(position.szi);
  const isLong = size > 0;

  return (
    <div className="border border-[var(--rule-light)] p-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
          {position.coin}
        </span>
        <span
          className="font-mono text-[8px] font-bold uppercase"
          style={{ color: isLong ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          {isLong ? "Long" : "Short"}
        </span>
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">
          {position.leverage.value}x
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">
          Entry: ${parseFloat(position.entryPx).toFixed(2)}
        </span>
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">
          Size: ${parseFloat(position.positionValue).toFixed(2)}
        </span>
        <span
          className="ml-auto font-mono text-[9px] font-bold"
          style={{ color: isProfit ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          {isProfit ? "+" : ""}${pnl.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
