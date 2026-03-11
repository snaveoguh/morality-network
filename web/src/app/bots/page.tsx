"use client";

import { useEffect, useState, useCallback } from "react";

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
  _bridged?: boolean;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BotsPage() {
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [launches, setLaunches] = useState<TokenLaunch[]>([]);
  const [scannerStats, setScannerStats] = useState<Record<string, number>>({});
  const [busMessages, setBusMessages] = useState<BusMessage[]>([]);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"agents" | "scanner" | "bus">("agents");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, scannerRes, busRes] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/agents/scanner?limit=100").then((r) => r.json()),
        fetch("/api/agents/bus?limit=100").then((r) => r.json()),
      ]);
      setAgents(agentsRes.agents ?? []);
      setLaunches(scannerRes.launches ?? []);
      setScannerStats(scannerRes.agent?.stats ?? {});
      setBusMessages(busRes.messages ?? []);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error("[Bots] Refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Bot Telemetry
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Raw agent state, token scanner output, and inter-agent message bus.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Last refresh:{" "}
            {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "..."}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)] underline hover:text-[var(--ink)] disabled:opacity-40"
          >
            {loading ? "Polling..." : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* ── Tab Switcher ────────────────────────────────── */}
      <div className="mb-4 flex gap-0 border-b border-[var(--rule-light)]">
        {(["agents", "scanner", "bus"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[var(--rule)] font-bold text-[var(--ink)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {tab === "agents" && `Agents (${agents.length})`}
            {tab === "scanner" && `Scanner (${launches.length})`}
            {tab === "bus" && `Bus (${busMessages.length})`}
          </button>
        ))}
      </div>

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
                No launches detected yet. Scanner polls Base L2 every 4 seconds.
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
          {expanded ? "\u25B2" : "\u25BC"}
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
        {message._bridged && (
          <span className="font-mono text-[8px] text-[#6E9EF5]">bridged</span>
        )}
        <span className="ml-auto flex-shrink-0 font-mono text-[8px] text-[var(--ink-faint)]">
          {age} ago
        </span>
        <span className="flex-shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-dashed border-[var(--rule-light)] bg-[var(--paper)] px-4 py-3">
          <DetailLabel>Message ID</DetailLabel>
          <DetailMono>{message.id}</DetailMono>
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

function timeSince(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
