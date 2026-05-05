"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { LogViewer } from "@/components/bots/LogViewer";

// ─── Types (mirroring API responses) ────────────────────────────────────────

interface AgentSnapshot {
  id: string;
  name: string;
  description: string;
  status: string;
  startedAt: number | null;
  lastActivityAt: number | null;
  stats: Record<string, number>;
  errors: string[];
  remote?: boolean;
  source?: string;
}

interface TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

interface ScoreBreakdown {
  contractVerified: number;
  initialLiquidity: number;
  holderCount: number;
  deployerHistory: number;
  lockedLiquidity: number;
  deployerAge: number;
}

interface DexScreenerData {
  priceUsd: string | null;
  liquidity: { usd: number } | null;
  volume24h: number | null;
  priceChange24h: number | null;
  pairUrl: string | null;
  fdv: number | null;
}

interface TokenLaunch {
  poolAddress: string;
  tokenAddress: string;
  pairedAsset: string;
  dex: string;
  blockNumber: number;
  txHash: string;
  deployer: string;
  discoveredAt: number;
  tokenMeta: TokenMeta | null;
  dexScreenerData: DexScreenerData | null;
  score: number;
  scoreBreakdown: ScoreBreakdown | null;
  enriched: boolean;
}

interface BusMessage {
  id: string;
  from: string;
  to: string;
  topic: string;
  payload: unknown;
  timestamp: number;
  meta?: {
    sender?: {
      address?: string | null;
      ens?: string | null;
    };
    humanPrompt?: boolean;
    promptText?: string | null;
    promptPreview?: string | null;
    relayedFrom?: string | null;
    receivedAt?: number;
    bridge?: {
      verified?: boolean;
      trusted?: boolean;
      signer?: string | null;
      origin?: string | null;
      reason?: string | null;
      relayAgeMs?: number | null;
    };
  };
  _bridged?: boolean;
}

interface ThroughputTopic {
  topic: string;
  count: number;
  throughputPerMinute: number;
  lastSeenAt: number;
  lastFrom: string;
  lastTo: string;
}

interface SwarmConsoleState {
  generatedAt: number;
  mode: "worker" | "request";
  throughput: {
    window: {
      since: number;
      until: number;
      windowMs: number;
      minutes: number;
    };
    totals: {
      events: number;
      throughputPerMinute: number;
      latestEventAt: number | null;
    };
    topics: ThroughputTopic[];
  };
  bridge: {
    configured: boolean;
    consumer: string;
    topics: string[];
    cursor: {
      lastTimestampMs: number;
      updatedAt: number;
      lastEventId: string | null;
    } | null;
    latestTopicEventAt: number | null;
    lagMs: number | null;
    pendingEvents: number;
    verifiedRelayCount: number;
    trustedRelayCount: number;
    uniqueSigners: string[];
    signature: {
      required: boolean;
      allowlistedSigners: number;
    };
  };
  trader: {
    decisions: Array<{
      id: string;
      topic: string;
      timestamp: number;
      market: string;
      side: string | null;
      sizeUsd: number | null;
      pnlUsd: number | null;
      executionVenue: string | null;
      reason: string | null;
      dryRun: boolean | null;
      payload: Record<string, unknown>;
    }>;
  };
  ai: {
    windowHours: number;
    summary: {
      totals?: {
        invocations: number;
        estimatedCostUsd: number;
        avgLatencyMs: number;
      };
      providers?: Array<{
        provider?: string;
        invocations: number;
        estimatedCostUsd: number;
        avgLatencyMs: number;
        success: number;
        error: number;
      }>;
    } | null;
    budgets: Array<{
      provider: string;
      allowed: boolean;
      windowHours: number;
      totalUsd: number | null;
      providerUsd: number | null;
      totalSpentUsd: number;
      providerSpentUsd: number;
      totalRemainingUsd: number | null;
      providerRemainingUsd: number | null;
      totalExceeded: boolean;
      providerExceeded: boolean;
    }>;
  };
}

// ─── Metrics V2 types ────────────────────────────────────────────────────────

interface OpenPositionRow {
  position: {
    id: string;
    marketSymbol: string;
    direction: "long" | "short";
    entryPriceUsd: number;
    entryNotionalUsd: number;
    openedAt: number;
    leverage?: number;
    signalSource?: string;
  };
  currentPriceUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
}

interface MetricsV2Response {
  performance: {
    totals: {
      openPositions: number;
      closedPositions: number;
      deployedUsd: number;
      unrealizedPnlUsd: number;
      realizedPnlUsd: number;
      grossPnlUsd: number;
    };
    open: OpenPositionRow[];
    readiness: {
      liveReady: boolean;
      dryRun: boolean;
      balances: Array<{ symbol: string; formatted: string }>;
      account?: string;
    };
    dryRun: boolean;
    account: string;
  } | null;
  pgAvailable: boolean;
  access: {
    operator: boolean;
    holder: boolean;
    fullAccess: boolean;
  };
}

// ─── Health types ────────────────────────────────────────────────────────────

type DotStatus = "green" | "amber" | "red" | "unknown";

interface HealthDot {
  label: string;
  status: DotStatus;
  detail?: string;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BotsPage() {
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [launches, setLaunches] = useState<TokenLaunch[]>([]);
  const [scannerStats, setScannerStats] = useState<Record<string, number>>({});
  const [busMessages, setBusMessages] = useState<BusMessage[]>([]);
  const [consoleState, setConsoleState] = useState<SwarmConsoleState | null>(null);
  const [metricsV2, setMetricsV2] = useState<MetricsV2Response | null>(null);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "degraded">("connecting");
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "console" | "agents" | "scanner" | "bus" | "logs">("overview");
  const lastConsoleRefreshRef = useRef(0);

  const refresh = useCallback(async (forceScannerRefresh = false) => {
    setLoading(true);
    try {
      const scannerUrl = forceScannerRefresh
        ? "/api/agents/scanner?limit=100&refresh=1"
        : "/api/agents/scanner?limit=100";
      const [agentsRes, scannerRes, busRes, consoleRes, metricsRes] = await Promise.allSettled([
        fetch("/api/agents").then((r) => r.json()),
        fetch(scannerUrl).then((r) => r.json()),
        fetch("/api/agents/bus?limit=100").then((r) => r.json()),
        fetch("/api/agents/console?windowMs=900000").then((r) => r.ok ? r.json() : null),
        fetch("/api/trading/metrics-v2").then((r) => r.ok ? r.json() : null),
      ]);
      if (agentsRes.status === "fulfilled") setAgents(agentsRes.value.agents ?? []);
      if (scannerRes.status === "fulfilled") {
        setLaunches(scannerRes.value.launches ?? []);
        setScannerStats(scannerRes.value.agent?.stats ?? {});
      }
      if (busRes.status === "fulfilled") setBusMessages(busRes.value.messages ?? []);
      if (consoleRes.status === "fulfilled" && consoleRes.value && !consoleRes.value.error) {
        setConsoleState(consoleRes.value as SwarmConsoleState);
      }
      if (metricsRes.status === "fulfilled" && metricsRes.value && !metricsRes.value.error) {
        setMetricsV2(metricsRes.value as MetricsV2Response);
      }
      setLastRefresh(Date.now());
      lastConsoleRefreshRef.current = Date.now();
    } catch (err) {
      console.error("[Bots] Refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(false);
    const interval = setInterval(() => refresh(false), 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource("/api/agents/events/stream?limit=100&historyMs=300000");
    setStreamStatus("connecting");

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as
          | { type: "connected" | "heartbeat" }
          | { type: "event"; event: BusMessage }
          | { type: "error"; message?: string };

        if (payload.type === "connected" || payload.type === "heartbeat") {
          setStreamStatus("live");
          return;
        }

        if (payload.type === "error") {
          setStreamStatus("degraded");
          return;
        }

        if (payload.type === "event") {
          setStreamStatus("live");
          setLastRefresh(Date.now());
          setBusMessages((current) => {
            const existing = new Set(current.map((message) => message.id));
            if (existing.has(payload.event.id)) {
              return current;
            }
            return [payload.event, ...current].slice(0, 100);
          });
          if (Date.now() - lastConsoleRefreshRef.current > 5_000) {
            lastConsoleRefreshRef.current = Date.now();
            void refresh(false);
          }
        }
      } catch {
        setStreamStatus("degraded");
      }
    };

    es.onerror = () => {
      setStreamStatus("degraded");
    };

    return () => {
      es.close();
    };
  }, []);

  // ── Derive health dots ───────────────────────────────────────────────────
  const healthDots = deriveHealthDots({ agents, consoleState, metricsV2, streamStatus });
  const statusSentence = deriveStatusSentence({ metricsV2, consoleState, agents });

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
      <div className="mb-4 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Bot Telemetry
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Live swarm console, token scanner output, and inter-agent message telemetry.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Last refresh:{" "}
            {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "..."}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Stream: {streamStatus}
          </span>
          <button
            onClick={() => {
              void refresh(true);
            }}
            disabled={loading}
            className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] underline hover:text-[var(--ink)] disabled:opacity-40"
          >
            {loading ? "Polling..." : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* ── Always-visible health strip ──────────────────── */}
      <HealthStrip dots={healthDots} sentence={statusSentence} />

      {/* ── Tab Switcher ────────────────────────────────── */}
      <div className="mb-4 flex gap-0 border-b border-[var(--rule-light)]">
        {(["overview", "console", "agents", "scanner", "bus", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[var(--rule)] font-bold text-[var(--ink)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {tab === "overview" && "Overview"}
            {tab === "console" && "Console"}
            {tab === "agents" && `Agents (${agents.length})`}
            {tab === "scanner" && `Scanner (${launches.length})`}
            {tab === "bus" && `Bus (${busMessages.length})`}
            {tab === "logs" && "Live Logs"}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewPanel
          metricsV2={metricsV2}
          consoleState={consoleState}
          agents={agents}
        />
      )}

      {activeTab === "console" && (
        <SwarmConsolePanel state={consoleState} />
      )}

      {/* ── Agents Tab ──────────────────────────────────── */}
      {activeTab === "agents" && (
        <div className="space-y-4">
          {agents.length === 0 && (
            <p className="font-mono text-[10px] text-[var(--ink-faint)]">
              No agents registered.
            </p>
          )}
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* ── Scanner Tab ─────────────────────────────────── */}
      {activeTab === "scanner" && (
        <div>
          <ScannerStatsBar stats={scannerStats} />
          <div className="mt-4 space-y-0">
            {launches.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                No launches visible yet. In worker mode this page reads persisted Base launch data
                from the indexer. Refresh Now will trigger a DexScreener-backed backend sync if
                the store is empty.
              </p>
            ) : (
              launches.map((launch) => (
                <LaunchRow key={launch.poolAddress} launch={launch} />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Bus Tab ──────────────────────────────────────── */}
      {activeTab === "bus" && (
        <div>
          {busMessages.length === 0 ? (
            <p className="font-mono text-[10px] text-[var(--ink-faint)]">
              No messages on the bus yet.
            </p>
          ) : (
            <div className="space-y-0">
              {busMessages.map((msg) => (
                <BusMessageRow key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Logs Tab ─────────────────────────────────────── */}
      {activeTab === "logs" && <LogViewer />}
    </div>
  );
}

// ─── Health strip helpers ────────────────────────────────────────────────────

function deriveHealthDots({
  agents,
  consoleState,
  metricsV2,
  streamStatus,
}: {
  agents: AgentSnapshot[];
  consoleState: SwarmConsoleState | null;
  metricsV2: MetricsV2Response | null;
  streamStatus: "connecting" | "live" | "degraded";
}): HealthDot[] {
  // Web: SSE stream status
  const webStatus: DotStatus =
    streamStatus === "live" ? "green" : streamStatus === "degraded" ? "red" : "amber";

  // Worker: any agent running
  const workerRunning = agents.some((a) => a.status === "running");
  const workerStatus: DotStatus = agents.length === 0
    ? "unknown"
    : workerRunning
      ? "green"
      : agents.some((a) => a.status === "error")
        ? "red"
        : "amber";

  // Swarm: throughput activity in last 5 min
  const latestEvent = consoleState?.throughput?.totals?.latestEventAt;
  const swarmActive = latestEvent && Date.now() - latestEvent < 5 * 60 * 1000;
  const swarmTopics = consoleState?.throughput?.topics ?? [];
  const swarmHasSwarmTopic = swarmTopics.some((t) =>
    t.topic?.toLowerCase().includes("swarm") || t.topic?.toLowerCase().includes("editorial")
  );
  const swarmStatus: DotStatus = consoleState === null
    ? "unknown"
    : swarmActive && swarmHasSwarmTopic
      ? "green"
      : swarmActive
        ? "amber"
        : "red";

  // Signals: trader decisions exist recently (in last 2h)
  const decisions = consoleState?.trader?.decisions ?? [];
  const recentDecision = decisions[0];
  const signalFresh = recentDecision && Date.now() - recentDecision.timestamp < 2 * 60 * 60 * 1000;
  const signalsStatus: DotStatus = consoleState === null
    ? "unknown"
    : signalFresh
      ? "green"
      : decisions.length > 0
        ? "amber"
        : "red";

  // Postgres
  const pgStatus: DotStatus = metricsV2 === null
    ? "unknown"
    : metricsV2.pgAvailable
      ? "green"
      : "red";

  // HL API: positions loaded means HL responded
  const hlPositions = metricsV2?.performance?.totals?.openPositions ?? null;
  const hlStatus: DotStatus = metricsV2 === null
    ? "unknown"
    : hlPositions !== null
      ? "green"
      : "red";

  return [
    { label: "Web", status: webStatus, detail: `SSE ${streamStatus}` },
    { label: "Worker", status: workerStatus, detail: workerRunning ? `${agents.filter(a => a.status === "running").length} running` : "no agents running" },
    { label: "Swarm", status: swarmStatus, detail: swarmActive ? `active ${timeSince(latestEvent!)} ago` : "no recent events" },
    { label: "Signals", status: signalsStatus, detail: recentDecision ? `last ${timeSince(recentDecision.timestamp)} ago` : "no decisions" },
    { label: "Postgres", status: pgStatus, detail: metricsV2 ? (metricsV2.pgAvailable ? "reachable" : "unreachable") : "unknown" },
    { label: "HL API", status: hlStatus, detail: hlPositions !== null ? `${hlPositions} open` : "no data" },
  ];
}

function deriveStatusSentence({
  metricsV2,
  consoleState,
  agents,
}: {
  metricsV2: MetricsV2Response | null;
  consoleState: SwarmConsoleState | null;
  agents: AgentSnapshot[];
}): string {
  const openCount = metricsV2?.performance?.totals?.openPositions ?? null;
  const realizedPnl = metricsV2?.performance?.totals?.realizedPnlUsd ?? null;
  const decisions = consoleState?.trader?.decisions ?? [];
  const entriesToday = decisions.filter(
    (d) => d.topic === "trade-executed" && Date.now() - d.timestamp < 24 * 60 * 60 * 1000,
  ).length;
  const workerRunning = agents.some((a) => a.status === "running");
  const swarmTopics = consoleState?.throughput?.topics ?? [];
  const mappedMarkets = swarmTopics.filter(
    (t) => t.topic?.toLowerCase().includes("trade-candidate"),
  ).length;

  let mode = "UNKNOWN";
  if (metricsV2?.performance) {
    mode = openCount && openCount > 0 ? "HOLDING" : "FLAT";
    if (!workerRunning) mode = "OFFLINE";
  }

  const parts: string[] = [mode];
  if (openCount !== null) parts.push(`${openCount} position${openCount !== 1 ? "s" : ""}`);
  if (entriesToday !== undefined) parts.push(`${entriesToday} entries today`);
  if (realizedPnl !== null) parts.push(`realized P&L: ${realizedPnl >= 0 ? "+" : ""}$${Math.abs(realizedPnl).toFixed(2)}`);
  parts.push(`signals: ${mappedMarkets} markets mapped`);

  return parts.join(" · ");
}

// ─── Health Strip ────────────────────────────────────────────────────────────

function HealthStrip({ dots, sentence }: { dots: HealthDot[]; sentence: string }) {
  const dotColor: Record<DotStatus, string> = {
    green: "text-[#2d6a2e]",
    amber: "text-[#b8860b]",
    red: "text-[var(--accent-red)]",
    unknown: "text-[var(--ink-faint)]",
  };

  return (
    <div className="mb-4 border border-[var(--rule-light)] bg-[var(--bg-alt)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {dots.map((dot) => (
          <div key={dot.label} className="flex items-center gap-1.5" title={dot.detail}>
            <span className={`text-base leading-none ${dotColor[dot.status]}`}>●</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink)]">
              {dot.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-[var(--ink-light)]">{sentence}</p>
    </div>
  );
}

// ─── Overview Panel ──────────────────────────────────────────────────────────

function OverviewPanel({
  metricsV2,
  consoleState,
  agents,
}: {
  metricsV2: MetricsV2Response | null;
  consoleState: SwarmConsoleState | null;
  agents: AgentSnapshot[];
}) {
  return (
    <div className="space-y-6">
      {/* Trader card */}
      <TraderCard metricsV2={metricsV2} consoleState={consoleState} agents={agents} />

      {/* Open positions table */}
      <OpenPositionsTable metricsV2={metricsV2} />

      {/* Signal pipeline flow */}
      <SignalPipelineFlow consoleState={consoleState} />

      {/* Recent decisions */}
      <RecentDecisions consoleState={consoleState} />
    </div>
  );
}

// ─── Trader Card ─────────────────────────────────────────────────────────────

function TraderCard({
  metricsV2,
  consoleState,
  agents,
}: {
  metricsV2: MetricsV2Response | null;
  consoleState: SwarmConsoleState | null;
  agents: AgentSnapshot[];
}) {
  const totals = metricsV2?.performance?.totals;
  const readiness = metricsV2?.performance?.readiness;
  const balance = readiness?.balances?.[0]?.formatted ?? "—";
  const openCount = totals?.openPositions ?? "—";
  const realizedPnl = totals?.realizedPnlUsd ?? null;
  const unrealizedPnl = totals?.unrealizedPnlUsd ?? null;
  const dryRun = metricsV2?.performance?.dryRun;

  // Last cycle from trader-cycle-complete events
  const cycleDecisions = consoleState?.trader?.decisions?.filter(
    (d) => d.topic === "trader-cycle-complete",
  ) ?? [];
  const lastCycle = cycleDecisions[0] ?? null;
  const cycleSinceMs = lastCycle ? Date.now() - lastCycle.timestamp : null;
  const cycleDurationMs =
    lastCycle?.payload?.durationMs != null
      ? Number(lastCycle.payload.durationMs)
      : null;
  const cycleErrors =
    lastCycle?.payload?.errors != null
      ? Number(lastCycle.payload.errors)
      : null;

  const workerAgent = agents.find(
    (a) => a.id === "worker" || a.id?.includes("trader") || a.name?.toLowerCase().includes("worker"),
  );

  return (
    <div className="border border-[var(--rule-light)] p-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Trader
        {dryRun && (
          <span className="ml-2 text-[#b8860b]">DRY RUN</span>
        )}
      </p>
      <h2 className="mt-1 font-headline text-2xl text-[var(--ink)]">
        {readiness?.account
          ? `${readiness.account.slice(0, 6)}…${readiness.account.slice(-4)}`
          : "HL Perps Trader"}
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OverviewMetric label="Balance" value={balance} />
        <OverviewMetric
          label="Open Positions"
          value={String(openCount)}
        />
        <OverviewMetric
          label="Realized P&L"
          value={
            realizedPnl == null
              ? "—"
              : `${realizedPnl >= 0 ? "+" : ""}$${Math.abs(realizedPnl).toFixed(2)}`
          }
          valueClass={
            realizedPnl == null
              ? undefined
              : realizedPnl >= 0
                ? "text-[#2d6a2e]"
                : "text-[var(--accent-red)]"
          }
        />
        <OverviewMetric
          label="Unrealized P&L"
          value={
            unrealizedPnl == null
              ? "—"
              : `${unrealizedPnl >= 0 ? "+" : ""}$${Math.abs(unrealizedPnl).toFixed(2)}`
          }
          valueClass={
            unrealizedPnl == null
              ? undefined
              : unrealizedPnl >= 0
                ? "text-[#2d6a2e]"
                : "text-[var(--accent-red)]"
          }
        />
      </div>

      {/* Last cycle */}
      <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
        <p className="font-mono text-[8px] text-[var(--ink-faint)]">
          Last cycle:{" "}
          {lastCycle == null ? (
            <span className="text-[#b8860b]">no cycle recorded</span>
          ) : (
            <span className="text-[var(--ink-light)]">
              {cycleSinceMs != null ? `${formatDurationMs(cycleSinceMs)} ago` : "—"}
              {cycleDurationMs != null ? ` · ${formatDurationMs(cycleDurationMs)}` : ""}
              {cycleErrors != null ? ` · errors: ${cycleErrors}` : ""}
            </span>
          )}
        </p>
        {workerAgent && (
          <p className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
            Worker: <span className={workerAgent.status === "running" ? "text-[#2d6a2e]" : "text-[var(--accent-red)]"}>{workerAgent.status}</span>
            {workerAgent.lastActivityAt && (
              <> · last active {timeSince(workerAgent.lastActivityAt)} ago</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-[var(--rule-light)] p-2">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {label}
      </p>
      <p className={`mt-0.5 font-headline text-xl text-[var(--ink)] ${valueClass ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Open Positions Table ────────────────────────────────────────────────────

function OpenPositionsTable({ metricsV2 }: { metricsV2: MetricsV2Response | null }) {
  const open = metricsV2?.performance?.open ?? [];
  const fullAccess = metricsV2?.access?.fullAccess ?? false;

  return (
    <div className="border border-[var(--rule-light)]">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-light)] px-4 py-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink)]">
          Open Positions
        </h3>
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">
          {open.length} total
        </span>
      </div>

      {!fullAccess && (
        <p className="px-4 py-3 font-mono text-[9px] text-[var(--ink-faint)]">
          Operator or MO holder access required to view open positions.
        </p>
      )}

      {fullAccess && open.length === 0 && (
        <p className="px-4 py-3 font-mono text-[9px] text-[var(--ink-faint)]">
          No open positions.
        </p>
      )}

      {fullAccess && open.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--rule-light)]">
                {["Coin", "Side", "Entry", "Current", "Unreal PnL", "Notional", "Age", "Signal"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-1.5 text-left font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-faint)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.map((row) => {
                const pnl = row.unrealizedPnlUsd;
                const pnlColor = pnl > 0
                  ? "text-[#2d6a2e]"
                  : pnl < 0
                    ? "text-[var(--accent-red)]"
                    : "text-[var(--ink-faint)]";
                const age = timeSince(row.position.openedAt);
                return (
                  <tr
                    key={row.position.id}
                    className="border-b border-[var(--rule-light)] last:border-0"
                  >
                    <td className="px-3 py-1.5 font-mono text-[10px] font-bold text-[var(--ink)]">
                      {row.position.marketSymbol}
                    </td>
                    <td className={`px-3 py-1.5 font-mono text-[9px] uppercase ${row.position.direction === "long" ? "text-[#2d6a2e]" : "text-[var(--accent-red)]"}`}>
                      {row.position.direction}
                      {row.position.leverage ? ` ${row.position.leverage}x` : ""}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-[var(--ink-light)]">
                      ${row.position.entryPriceUsd.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-[var(--ink-light)]">
                      ${row.currentPriceUsd.toFixed(2)}
                    </td>
                    <td className={`px-3 py-1.5 font-mono text-[9px] ${pnlColor}`}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-[var(--ink-light)]">
                      ${row.position.entryNotionalUsd.toFixed(0)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[9px] text-[var(--ink-faint)]">
                      {age}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[8px] text-[var(--ink-faint)]">
                      {row.position.signalSource ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Signal Pipeline Flow ────────────────────────────────────────────────────

interface PipelineStage {
  label: string;
  status: DotStatus;
  detail: string;
  lastRun?: string;
}

function SignalPipelineFlow({ consoleState }: { consoleState: SwarmConsoleState | null }) {
  const topics = consoleState?.throughput?.topics ?? [];

  // Derive stage statuses from throughput topics
  const findTopic = (...names: string[]) =>
    topics.find((t) => names.some((n) => t.topic?.toLowerCase().includes(n)));

  const rssTopic = findTopic("editorial", "rss", "news");
  const swarmTopic = findTopic("swarm");
  const aggregatedTopic = findTopic("aggregated", "archive");
  const tradeCandidateTopic = findTopic("trade-candidate");
  const compositeTopic = findTopic("composite", "signal");
  const decisionTopic = findTopic("trade-executed", "trader-cycle");

  const rssCount = rssTopic?.count ?? 0;
  const swarmOk = swarmTopic != null && swarmTopic.count > 0;
  const swarmStuck =
    swarmTopic != null
      ? Date.now() - swarmTopic.lastSeenAt > 10 * 60 * 1000
      : false;
  const aggregatedCount = aggregatedTopic?.count ?? 0;
  const mappedCount = tradeCandidateTopic?.count ?? 0;
  const compositeOk = compositeTopic != null && compositeTopic.count > 0;
  const decisionCount = decisionTopic?.count ?? 0;

  const stages: PipelineStage[] = [
    {
      label: `RSS Feeds`,
      status: rssCount > 0 ? "green" : consoleState ? "amber" : "unknown",
      detail: rssCount > 0 ? `${rssCount} events` : "no events",
      lastRun: rssTopic ? timeSince(rssTopic.lastSeenAt) + " ago" : undefined,
    },
    {
      label: "Swarm",
      status: consoleState === null
        ? "unknown"
        : !swarmTopic
          ? "red"
          : swarmStuck
            ? "red"
            : swarmOk
              ? "green"
              : "amber",
      detail: !swarmTopic
        ? "HUNG / no data"
        : swarmStuck
          ? "HUNG"
          : swarmOk
            ? `${swarmTopic.count} events`
            : "degraded",
      lastRun: swarmTopic ? timeSince(swarmTopic.lastSeenAt) + " ago" : undefined,
    },
    {
      label: `Aggregated`,
      status: aggregatedCount > 0 ? "green" : consoleState ? "amber" : "unknown",
      detail: `${aggregatedCount} records`,
      lastRun: aggregatedTopic ? timeSince(aggregatedTopic.lastSeenAt) + " ago" : undefined,
    },
    {
      label: `Market Mapping`,
      status: mappedCount > 0 ? "green" : consoleState ? "red" : "unknown",
      detail: mappedCount > 0 ? `${mappedCount} candidates` : `0/${aggregatedCount} mapped`,
      lastRun: tradeCandidateTopic ? timeSince(tradeCandidateTopic.lastSeenAt) + " ago" : undefined,
    },
    {
      label: "Composite",
      status: compositeOk ? "green" : consoleState ? "amber" : "unknown",
      detail: compositeTopic ? `${compositeTopic.count} signals` : "no composite signals",
      lastRun: compositeTopic ? timeSince(compositeTopic.lastSeenAt) + " ago" : undefined,
    },
    {
      label: "Decision",
      status: decisionCount > 0 ? "green" : consoleState ? "amber" : "unknown",
      detail: decisionCount > 0 ? `${decisionCount} executed` : "no executions",
      lastRun: decisionTopic ? timeSince(decisionTopic.lastSeenAt) + " ago" : undefined,
    },
  ];

  const dotColor: Record<DotStatus, string> = {
    green: "text-[#2d6a2e]",
    amber: "text-[#b8860b]",
    red: "text-[var(--accent-red)]",
    unknown: "text-[var(--ink-faint)]",
  };
  const stageBorder: Record<DotStatus, string> = {
    green: "border-[#2d6a2e]/40",
    amber: "border-[#b8860b]/40",
    red: "border-[var(--accent-red)]/60",
    unknown: "border-[var(--rule-light)]",
  };

  return (
    <div className="border border-[var(--rule-light)] p-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Signal Pipeline
      </p>
      <h3 className="mt-1 font-headline text-2xl text-[var(--ink)]">
        Pipeline Health
      </h3>
      <div className="mt-3 flex flex-wrap items-center gap-0">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center">
            <div
              className={`border ${stageBorder[stage.status]} px-3 py-2 min-w-[100px]`}
              title={stage.lastRun ? `Last: ${stage.lastRun}` : undefined}
            >
              <div className="flex items-center gap-1">
                <span className={`text-[10px] leading-none ${dotColor[stage.status]}`}>●</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink)]">
                  {stage.label}
                </span>
              </div>
              <p className={`mt-0.5 font-mono text-[8px] ${stage.status === "red" ? "text-[var(--accent-red)]" : "text-[var(--ink-faint)]"}`}>
                {stage.detail}
              </p>
              {stage.lastRun && (
                <p className="font-mono text-[7px] text-[var(--ink-faint)]">{stage.lastRun}</p>
              )}
            </div>
            {i < stages.length - 1 && (
              <span className="px-1 font-mono text-[10px] text-[var(--ink-faint)]">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Decisions ────────────────────────────────────────────────────────

function RecentDecisions({ consoleState }: { consoleState: SwarmConsoleState | null }) {
  const decisions = consoleState?.trader?.decisions?.slice(0, 10) ?? [];

  return (
    <div className="border border-[var(--rule-light)]">
      <div className="flex items-baseline justify-between border-b border-[var(--rule-light)] px-4 py-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink)]">
          Recent Decisions
        </h3>
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">
          last {decisions.length}
        </span>
      </div>
      {decisions.length === 0 ? (
        <p className="px-4 py-3 font-mono text-[9px] text-[var(--ink-faint)]">
          No recent trader decisions.
          {consoleState === null && " Console data requires operator access."}
        </p>
      ) : (
        <div>
          {decisions.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--rule-light)] px-4 py-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]">
                  {d.topic} · {d.market}
                </p>
                <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                  {(d.side ?? "n/a").toUpperCase()} · {d.reason ?? "no reason"} ·{" "}
                  {d.executionVenue ?? "unknown venue"} · {timeSince(d.timestamp)} ago
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] text-[var(--ink)]">
                  {d.sizeUsd == null ? "--" : `$${formatCompact(d.sizeUsd)}`}
                </p>
                <p
                  className={`font-mono text-[8px] ${
                    d.pnlUsd == null
                      ? "text-[var(--ink-faint)]"
                      : d.pnlUsd >= 0
                        ? "text-[#2d6a2e]"
                        : "text-[var(--accent-red)]"
                  }`}
                >
                  {d.pnlUsd == null
                    ? d.dryRun
                      ? "dry run"
                      : "--"
                    : `${d.pnlUsd >= 0 ? "+" : ""}$${formatCompact(Math.abs(d.pnlUsd))}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Existing panels (unchanged) ─────────────────────────────────────────────

function SwarmConsolePanel({ state }: { state: SwarmConsoleState | null }) {
  if (!state) {
    return (
      <div className="border border-[var(--rule-light)] p-4 space-y-2">
        <p className="font-mono text-[10px] text-[var(--ink-faint)]">
          Console aggregate view is gated on operator access — sign in with an operator
          wallet (or hit <span className="font-mono">/api/agents/console</span> with a bearer
          token) to load throughput, bridge health, AI spend and trader decisions.
        </p>
        <p className="font-mono text-[10px] text-[var(--ink-faint)]">
          The live bus tab below keeps streaming without auth, so you can still watch raw
          messages flow.
        </p>
      </div>
    );
  }

  const totalCost = state.ai.summary?.totals?.estimatedCostUsd ?? 0;
  const totalLatency = state.ai.summary?.totals?.avgLatencyMs ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ConsoleMetricCard
          label="Event Throughput"
          value={`${state.throughput.totals.throughputPerMinute.toFixed(2)}/min`}
          detail={`${state.throughput.totals.events} events in ${state.throughput.window.minutes}m`}
        />
        <ConsoleMetricCard
          label="Bridge Lag"
          value={state.bridge.lagMs == null ? "n/a" : formatDurationMs(state.bridge.lagMs)}
          detail={
            state.bridge.configured
              ? `${state.bridge.pendingEvents} pending for ${state.bridge.consumer}`
              : "Bridge not configured"
          }
        />
        <ConsoleMetricCard
          label="Trader Decisions"
          value={String(state.trader.decisions.length)}
          detail={
            state.trader.decisions[0]
              ? `${state.trader.decisions[0].topic} ${timeSince(state.trader.decisions[0].timestamp)} ago`
              : "No trader events yet"
          }
        />
        <ConsoleMetricCard
          label="AI Spend"
          value={`$${totalCost.toFixed(2)}`}
          detail={
            state.ai.summary
              ? `${state.ai.summary.totals?.invocations ?? 0} calls, ${totalLatency}ms avg latency`
              : "No AI telemetry yet"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ConsolePanel title="Topic Throughput" eyebrow={`Window ${state.throughput.window.minutes}m`}>
          <div className="space-y-0">
            {state.throughput.topics.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                No durable events in the current window.
              </p>
            ) : (
              state.throughput.topics.slice(0, 10).map((topic) => (
                <div
                  key={topic.topic}
                  className="flex items-center gap-3 border-b border-[var(--rule-light)] py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink)]">
                      {topic.topic}
                    </p>
                    <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                      {topic.lastFrom} → {topic.lastTo} • last {timeSince(topic.lastSeenAt)} ago
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-headline text-lg text-[var(--ink)]">{topic.count}</p>
                    <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                      {topic.throughputPerMinute.toFixed(2)}/min
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ConsolePanel>

        <ConsolePanel title="Bridge Health" eyebrow={state.bridge.consumer}>
          <div className="space-y-3">
            <ConsoleKeyValue
              label="Signature Policy"
              value={
                state.bridge.signature.required
                  ? `required (${state.bridge.signature.allowlistedSigners} allowlisted)`
                  : "optional"
              }
            />
            <ConsoleKeyValue
              label="Cursor"
              value={
                state.bridge.cursor
                  ? `${timeSince(state.bridge.cursor.updatedAt)} ago`
                  : "no persisted cursor"
              }
            />
            <ConsoleKeyValue
              label="Verified Relays"
              value={`${state.bridge.verifiedRelayCount} verified / ${state.bridge.trustedRelayCount} trusted`}
            />
            <ConsoleKeyValue
              label="Signers"
              value={
                state.bridge.uniqueSigners.length > 0
                  ? state.bridge.uniqueSigners.map((signer) => shortenAddress(signer) ?? signer).join(", ")
                  : "none seen in window"
              }
            />
            <ConsoleKeyValue
              label="Lag"
              value={state.bridge.lagMs == null ? "n/a" : formatDurationMs(state.bridge.lagMs)}
            />
          </div>
        </ConsolePanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <ConsolePanel title="Trader Decisions" eyebrow="Recent execution events">
          <div className="space-y-0">
            {state.trader.decisions.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--ink-faint)]">
                No recent trader decisions recorded.
              </p>
            ) : (
              state.trader.decisions.slice(0, 8).map((decision) => (
                <div
                  key={decision.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--rule-light)] py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]">
                      {decision.topic} • {decision.market}
                    </p>
                    <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                      {(decision.side ?? "n/a").toUpperCase()} • {decision.reason ?? "no reason"} •{" "}
                      {decision.executionVenue ?? "unknown venue"} • {timeSince(decision.timestamp)} ago
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[9px] text-[var(--ink)]">
                      {decision.sizeUsd == null ? "--" : `$${formatCompact(decision.sizeUsd)}`}
                    </p>
                    <p
                      className={`font-mono text-[8px] ${
                        decision.pnlUsd == null
                          ? "text-[var(--ink-faint)]"
                          : decision.pnlUsd >= 0
                            ? "text-[#2d6a2e]"
                            : "text-[var(--accent-red)]"
                      }`}
                    >
                      {decision.pnlUsd == null
                        ? decision.dryRun
                          ? "dry run"
                          : "--"
                        : `${decision.pnlUsd >= 0 ? "+" : ""}$${formatCompact(Math.abs(decision.pnlUsd))}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ConsolePanel>

        <ConsolePanel title="AI Providers" eyebrow={`${state.ai.windowHours}h budget window`}>
          <div className="space-y-2">
            {state.ai.budgets.map((budget) => {
              const spend = budget.providerSpentUsd ?? 0;
              const cap = budget.providerUsd;
              const ratio = cap && cap > 0 ? Math.min(1, spend / cap) : 0;
              return (
                <div key={budget.provider} className="border-b border-[var(--rule-light)] pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]">
                      {budget.provider}
                    </p>
                    <p
                      className={`font-mono text-[8px] uppercase tracking-[0.15em] ${
                        budget.allowed ? "text-[#2d6a2e]" : "text-[var(--accent-red)]"
                      }`}
                    >
                      {budget.allowed ? "allowed" : "blocked"}
                    </p>
                  </div>
                  <p className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
                    Spend ${spend.toFixed(2)}
                    {cap != null ? ` / $${cap.toFixed(2)}` : " / no provider cap"}
                  </p>
                  <div className="mt-1 h-1.5 bg-[var(--rule-light)]">
                    <div
                      className={`h-full ${budget.allowed ? "bg-[var(--ink)]" : "bg-[var(--accent-red)]"}`}
                      style={{ width: `${Math.max(4, ratio * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {state.ai.summary?.providers && state.ai.summary.providers.length > 0 && (
              <div className="pt-1">
                {state.ai.summary.providers.slice(0, 4).map((provider) => (
                  <ConsoleKeyValue
                    key={provider.provider ?? "unknown"}
                    label={`${provider.provider ?? "unknown"} latency`}
                    value={`${provider.avgLatencyMs}ms avg • ${provider.invocations} calls`}
                  />
                ))}
              </div>
            )}
          </div>
        </ConsolePanel>
      </div>
    </div>
  );
}

// ─── Agent Card ─────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentSnapshot }) {
  return (
    <div className="border border-[var(--rule-light)] p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
            {agent.name}
            {agent.remote && (
              <span className="ml-2 font-normal text-[var(--ink-faint)]">
                [remote]
              </span>
            )}
          </h2>
          <p className="mt-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
            {agent.id}
          </p>
        </div>
        <StatusPill status={agent.status} />
      </div>

      {/* Description */}
      <p className="mt-2 font-body-serif text-[11px] text-[var(--ink-light)]">
        {agent.description}
      </p>

      {/* Stats Grid */}
      {Object.keys(agent.stats).length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
          {Object.entries(agent.stats).map(([key, val]) => (
            <div key={key}>
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                {formatStatKey(key)}
              </span>
              <span className="ml-1.5 font-headline text-sm text-[var(--ink)]">
                {formatStatValue(key, val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {agent.errors.length > 0 && (
        <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--accent-red)]">
            Recent Errors
          </span>
          {agent.errors.map((err, i) => (
            <p
              key={i}
              className="mt-0.5 break-all font-mono text-[9px] text-[var(--ink-light)]"
            >
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="mt-2 flex gap-4 font-mono text-[8px] text-[var(--ink-faint)]">
        {agent.startedAt && (
          <span>Started: {new Date(agent.startedAt).toLocaleString()}</span>
        )}
        {agent.lastActivityAt && (
          <span>
            Last activity: {new Date(agent.lastActivityAt).toLocaleString()}
          </span>
        )}
        {agent.source && <span>Source: {agent.source}</span>}
      </div>
    </div>
  );
}

// ─── Scanner Stats Bar ──────────────────────────────────────────────────────

function ScannerStatsBar({ stats }: { stats: Record<string, number> }) {
  if (Object.keys(stats).length === 0) return null;

  return (
    <div className="flex flex-wrap gap-6 border border-[var(--rule-light)] p-3">
      {Object.entries(stats).map(([key, val]) => (
        <div key={key} className="flex flex-col">
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            {formatStatKey(key)}
          </span>
          <span className="font-headline text-lg text-[var(--ink)]">
            {formatStatValue(key, val)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Launch Row ─────────────────────────────────────────────────────────────

function LaunchRow({ launch }: { launch: TokenLaunch }) {
  const [expanded, setExpanded] = useState(false);

  const symbol = launch.tokenMeta?.symbol ?? "???";
  const name = launch.tokenMeta?.name ?? "Unknown";
  const priceUsd = launch.dexScreenerData?.priceUsd;
  const liqUsd = launch.dexScreenerData?.liquidity?.usd;
  const vol24 = launch.dexScreenerData?.volume24h;
  const change24 = launch.dexScreenerData?.priceChange24h;
  const age = timeSince(launch.discoveredAt * 1000);

  return (
    <div className="border-b border-[var(--rule-light)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-[var(--paper-tint)]"
      >
        {/* Score */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
          <span
            className={`font-headline text-lg ${
              launch.score >= 50
                ? "text-[#2d6a2e]"
                : launch.score >= 20
                ? "text-[var(--ink)]"
                : "text-[var(--ink-faint)]"
            }`}
          >
            {launch.score}
          </span>
        </div>

        {/* Token info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
              ${symbol}
            </span>
            <span className="truncate font-mono text-[9px] text-[var(--ink-faint)]">
              {name}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[8px] text-[var(--ink-faint)]">
            <span>{launch.dex}</span>
            <span>{age} ago</span>
            {launch.enriched && <span className="text-[#6E9EF5]">enriched</span>}
          </div>
        </div>

        {/* Price / Liquidity */}
        <div className="flex-shrink-0 text-right">
          {priceUsd ? (
            <span className="font-mono text-[10px] text-[var(--ink)]">
              ${Number(priceUsd).toFixed(8)}
            </span>
          ) : (
            <span className="font-mono text-[9px] text-[var(--ink-faint)]">
              No price
            </span>
          )}
          {liqUsd != null && (
            <p className="font-mono text-[8px] text-[var(--ink-faint)]">
              Liq ${formatCompact(liqUsd)}
              {vol24 != null && <> &middot; Vol ${formatCompact(vol24)}</>}
              {change24 != null && (
                <>
                  {" "}
                  &middot;{" "}
                  <span
                    className={
                      change24 >= 0 ? "text-[#2d6a2e]" : "text-[var(--accent-red)]"
                    }
                  >
                    {change24 >= 0 ? "+" : ""}
                    {change24.toFixed(1)}%
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Expand chevron */}
        <span className="flex-shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-dashed border-[var(--rule-light)] bg-[var(--paper)] px-4 py-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Addresses */}
            <div>
              <DetailLabel>Token</DetailLabel>
              <DetailMono>{launch.tokenAddress}</DetailMono>
              <DetailLabel>Pool</DetailLabel>
              <DetailMono>{launch.poolAddress}</DetailMono>
              <DetailLabel>Deployer</DetailLabel>
              <DetailMono>{launch.deployer}</DetailMono>
              <DetailLabel>Tx</DetailLabel>
              <DetailMono>
                <a
                  href={`https://basescan.org/tx/${launch.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--ink)]"
                >
                  {launch.txHash.slice(0, 18)}...
                </a>
              </DetailMono>
              <DetailLabel>Block</DetailLabel>
              <DetailMono>{launch.blockNumber.toLocaleString()}</DetailMono>
            </div>

            {/* Score Breakdown */}
            {launch.scoreBreakdown && (
              <div>
                <DetailLabel>Score Breakdown</DetailLabel>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(launch.scoreBreakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-[var(--rule-light)]">
                        <div
                          className="h-full bg-[var(--ink)]"
                          style={{
                            width: `${Math.min(100, (val / 25) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-16 font-mono text-[8px] text-[var(--ink-faint)]">
                        {formatStatKey(key)}
                      </span>
                      <span className="w-5 text-right font-mono text-[9px] text-[var(--ink)]">
                        {val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Token metadata */}
          {launch.tokenMeta && (
            <div className="mt-3 flex gap-6 border-t border-[var(--rule-light)] pt-2">
              <div>
                <DetailLabel>Decimals</DetailLabel>
                <DetailMono>{launch.tokenMeta.decimals}</DetailMono>
              </div>
              <div>
                <DetailLabel>Total Supply</DetailLabel>
                <DetailMono>
                  {formatCompact(
                    Number(launch.tokenMeta.totalSupply) /
                      10 ** launch.tokenMeta.decimals
                  )}
                </DetailMono>
              </div>
              {launch.dexScreenerData?.fdv != null && (
                <div>
                  <DetailLabel>FDV</DetailLabel>
                  <DetailMono>
                    ${formatCompact(launch.dexScreenerData.fdv)}
                  </DetailMono>
                </div>
              )}
              {launch.dexScreenerData?.pairUrl && (
                <div>
                  <DetailLabel>DexScreener</DetailLabel>
                  <a
                    href={launch.dexScreenerData.pairUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[9px] text-[#6E9EF5] underline"
                  >
                    View pair
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bus Message Row ────────────────────────────────────────────────────────

function BusMessageRow({ message }: { message: BusMessage }) {
  const [expanded, setExpanded] = useState(false);
  const age = timeSince(message.timestamp);
  const senderLabel =
    message.meta?.sender?.ens ??
    shortenAddress(message.meta?.sender?.address ?? null);
  const bridgeSigner = shortenAddress(message.meta?.bridge?.signer ?? null);
  const bridgeVerified = Boolean(message.meta?.bridge?.verified);
  const bridgeTrusted = Boolean(message.meta?.bridge?.trusted);

  return (
    <div className="border-b border-[var(--rule-light)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-[var(--paper-tint)]"
      >
        <span className="flex-shrink-0 font-mono text-[10px] font-bold text-[var(--ink)]">
          {message.topic}
        </span>
        <span className="font-mono text-[9px] text-[var(--ink-faint)]">
          {message.from} &rarr; {message.to}
        </span>
        {message.meta?.humanPrompt && (
          <span className="font-mono text-[8px] text-[#2d6a2e]">
            sender {senderLabel ?? "unknown"}
          </span>
        )}
        {message._bridged && (
          <span className="font-mono text-[8px] text-[#6E9EF5]">bridged</span>
        )}
        {bridgeVerified && (
          <span
            className={`font-mono text-[8px] ${
              bridgeTrusted ? "text-[#2d6a2e]" : "text-[#b8860b]"
            }`}
          >
            {bridgeTrusted ? "trusted signer" : "verified signer"} {bridgeSigner ?? ""}
          </span>
        )}
        <span className="ml-auto flex-shrink-0 font-mono text-[8px] text-[var(--ink-faint)]">
          {age} ago
        </span>
        <span className="flex-shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-dashed border-[var(--rule-light)] bg-[var(--paper)] px-4 py-3">
          <DetailLabel>Message ID</DetailLabel>
          <DetailMono>{message.id}</DetailMono>
          {message.meta?.humanPrompt && (
            <>
              <DetailLabel>Human Sender</DetailLabel>
              <DetailMono>
                {message.meta.sender?.ens ?? "Unknown ENS"}
                {message.meta.sender?.address
                  ? ` (${message.meta.sender.address})`
                  : ""}
              </DetailMono>
              {message.meta.promptText && (
                <>
                  <DetailLabel>Prompt</DetailLabel>
                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[9px] text-[var(--ink-light)]">
                    {message.meta.promptText}
                  </pre>
                </>
              )}
            </>
          )}
          {message.meta?.relayedFrom && (
            <>
              <DetailLabel>Relay Source</DetailLabel>
              <DetailMono>{message.meta.relayedFrom}</DetailMono>
            </>
          )}
          {message.meta?.receivedAt && (
            <>
              <DetailLabel>Received</DetailLabel>
              <DetailMono>
                {new Date(message.meta.receivedAt).toLocaleString()}
              </DetailMono>
            </>
          )}
          {message.meta?.bridge && (
            <>
              <DetailLabel>Bridge Signature</DetailLabel>
              <DetailMono>
                {message.meta.bridge.verified ? "verified" : "unverified"}
                {message.meta.bridge.trusted ? " • trusted" : ""}
                {message.meta.bridge.signer ? ` • ${message.meta.bridge.signer}` : ""}
              </DetailMono>
              {message.meta.bridge.origin && (
                <>
                  <DetailLabel>Bridge Origin</DetailLabel>
                  <DetailMono>{message.meta.bridge.origin}</DetailMono>
                </>
              )}
              {message.meta.bridge.reason && (
                <>
                  <DetailLabel>Bridge Note</DetailLabel>
                  <DetailMono>{message.meta.bridge.reason}</DetailMono>
                </>
              )}
            </>
          )}
          <DetailLabel>Payload</DetailLabel>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] text-[var(--ink-light)]">
            {JSON.stringify(message.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Tiny Components ────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-[#2d6a2e] text-[#e8f5e9]",
    idle: "bg-[var(--rule-light)] text-[var(--ink-faint)]",
    starting: "bg-[#b8860b] text-[#fff8dc]",
    stopping: "bg-[#b8860b] text-[#fff8dc]",
    error: "bg-[var(--accent-red)] text-white",
  };

  return (
    <span
      className={`rounded-sm px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] ${
        colors[status] ?? colors.idle
      }`}
    >
      {status}
    </span>
  );
}

function ConsoleMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-[var(--rule-light)] p-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {label}
      </p>
      <p className="mt-1 font-headline text-2xl text-[var(--ink)]">{value}</p>
      <p className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">{detail}</p>
    </div>
  );
}

function ConsolePanel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--rule-light)] p-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-headline text-2xl text-[var(--ink)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ConsoleKeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
        {label}
      </span>
      <span className="text-right font-mono text-[9px] text-[var(--ink-light)]">
        {value}
      </span>
    </div>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
      {children}
    </p>
  );
}

function DetailMono({ children }: { children: React.ReactNode }) {
  return (
    <p className="break-all font-mono text-[9px] text-[var(--ink-light)]">
      {children}
    </p>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
}

function formatStatValue(key: string, val: number): string {
  if (key.toLowerCase().includes("time") || key.toLowerCase().includes("at")) {
    if (val === 0) return "--";
    return new Date(val).toLocaleTimeString();
  }
  if (key.toLowerCase().includes("seconds") || key.toLowerCase().includes("uptime")) {
    if (val < 60) return `${val}s`;
    if (val < 3600) return `${Math.floor(val / 60)}m`;
    return `${Math.floor(val / 3600)}h ${Math.floor((val % 3600) / 60)}m`;
  }
  if (Number.isInteger(val)) return val.toLocaleString();
  return val.toFixed(1);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(0);
  if (n >= 0.01) return n.toFixed(2);
  return n.toFixed(6);
}

function shortenAddress(address: string | null): string | null {
  if (!address) return null;
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function timeSince(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatDurationMs(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
