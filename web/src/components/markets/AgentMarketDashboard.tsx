"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

interface Position {
  id: string;
  venue?: "base-spot" | "hyperliquid-perp";
  tokenAddress: `0x${string}`;
  marketSymbol?: string;
  entryPriceUsd: number;
  entryNotionalUsd: number;
  openedAt: number;
  closedAt?: number;
  exitPriceUsd?: number;
  status: "open" | "closed";
  txHash?: `0x${string}`;
  exitTxHash?: `0x${string}`;
}

interface OpenPositionMetric {
  position: Position;
  currentPriceUsd: number | null;
  marketValueUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
}

interface ClosedPositionMetric {
  position: Position;
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
}

interface PerformanceTotals {
  openPositions: number;
  closedPositions: number;
  deployedUsd: number;
  openMarketValueUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  grossPnlUsd: number;
  performanceFeeUsd: number;
  netPnlAfterFeeUsd: number;
}

interface ReadinessBalance {
  symbol: string;
  address: string;
  formatted: string;
  requiredFormatted?: string;
  meetsRequirement: boolean;
}

interface Readiness {
  executionVenue: "base-spot" | "hyperliquid-perp";
  dryRun: boolean;
  liveReady: boolean;
  reasons: string[];
  balances: ReadinessBalance[];
}

interface TraderPerformanceReport {
  timestamp: number;
  executionVenue: "base-spot" | "hyperliquid-perp";
  dryRun: boolean;
  account: `0x${string}`;
  fundingAddress: `0x${string}`;
  performanceFeeBps: number;
  readiness: Readiness;
  totals: PerformanceTotals;
  open: OpenPositionMetric[];
  closed: ClosedPositionMetric[];
}

interface MetricsResponse {
  performance?: TraderPerformanceReport;
  error?: string;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

function shortHex(value: string): string {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function symbolForPosition(position: Position): string {
  if (position.marketSymbol) return position.marketSymbol;
  return shortHex(position.tokenAddress);
}

function pnlClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-[var(--ink-faint)]";
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-[var(--ink-faint)]";
}

export function AgentMarketDashboard() {
  const [data, setData] = useState<TraderPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("0.01");
  const [fundInputError, setFundInputError] = useState<string | null>(null);

  const {
    sendTransactionAsync,
    data: fundingTxHash,
    isPending: isFundingPending,
    error: fundingError,
  } = useSendTransaction();
  const { isLoading: isFundingConfirming, isSuccess: fundingSuccess } = useWaitForTransactionReceipt({
    hash: fundingTxHash,
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/trading/metrics", { cache: "no-store" });
      const payload = (await response.json()) as MetricsResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      if (!payload.performance) {
        throw new Error("Missing performance payload");
      }

      setData(payload.performance);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const feePct = useMemo(() => {
    if (!data) return 5;
    return data.performanceFeeBps / 100;
  }, [data]);

  const handleFund = useCallback(async () => {
    try {
      setFundInputError(null);
      if (!data) return;
      if (!fundAmount || Number(fundAmount) <= 0) {
        setFundInputError("Enter an amount greater than 0");
        return;
      }

      await sendTransactionAsync({
        to: data.fundingAddress,
        value: parseEther(fundAmount),
      });
      setTimeout(() => {
        refresh().catch(() => {
          // ignored: UI already has polling fallback
        });
      }, 2_000);
    } catch (err) {
      setFundInputError(err instanceof Error ? err.message : "Funding transaction failed");
    }
  }, [data, fundAmount, refresh, sendTransactionAsync]);

  if (loading && !data) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Loading market telemetry...
      </p>
    );
  }

  if (!data) {
    return (
      <div className="border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-red)]">
          Market dashboard unavailable
        </p>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-faint)]">{error ?? "Unknown error"}</p>
      </div>
    );
  }

  const balances = data.readiness.balances.slice(0, 6);
  const closedRows = data.closed.slice(0, 20);

  return (
    <div className="space-y-6">
      <section className="border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-2xl font-bold text-[var(--ink)]">Agent Markets</h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          Live agent performance, balances, and funding flow.
        </p>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Venue: {data.executionVenue} | {data.dryRun ? "Dry Run" : "Live"} | Updated{" "}
          {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Open PnL" value={formatUsd(data.totals.unrealizedPnlUsd)} valueClass={pnlClass(data.totals.unrealizedPnlUsd)} />
        <MetricCard label="Realized PnL" value={formatUsd(data.totals.realizedPnlUsd)} valueClass={pnlClass(data.totals.realizedPnlUsd)} />
        <MetricCard label="Gross PnL" value={formatUsd(data.totals.grossPnlUsd)} valueClass={pnlClass(data.totals.grossPnlUsd)} />
        <MetricCard label={`Fee (${feePct.toFixed(2)}%)`} value={formatUsd(data.totals.performanceFeeUsd)} />
        <MetricCard label="Net PnL" value={formatUsd(data.totals.netPnlAfterFeeUsd)} valueClass={pnlClass(data.totals.netPnlAfterFeeUsd)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="border border-[var(--rule-light)] p-4 lg:col-span-2">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Readiness & Balances
          </h2>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            {data.readiness.liveReady ? "Live Ready" : "Gated"} | {shortHex(data.account)}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {balances.map((balance) => (
              <div key={balance.symbol} className="border border-[var(--rule-light)] p-2">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  {balance.symbol}
                </p>
                <p className={`font-headline text-sm ${balance.meetsRequirement ? "text-[var(--ink)]" : "text-red-700"}`}>
                  {balance.formatted}
                </p>
                {balance.requiredFormatted ? (
                  <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                    Min {balance.requiredFormatted}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {data.readiness.reasons.length > 0 ? (
            <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--accent-red)]">
                Gating Reasons
              </p>
              <p className="mt-1 font-mono text-[9px] text-[var(--ink-light)]">
                {data.readiness.reasons.join(" | ")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border border-[var(--rule-light)] p-4">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Fund Agent
          </h2>
          <p className="mt-1 break-all font-mono text-[9px] text-[var(--ink-faint)]">{data.fundingAddress}</p>
          <p className="mt-2 font-body-serif text-xs text-[var(--ink-light)]">
            Send ETH to the trading wallet. Performance fee is {feePct.toFixed(2)}% of realized profits.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              value={fundAmount}
              onChange={(event) => setFundAmount(event.target.value)}
              placeholder="0.01"
              className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--rule)]"
            />
            <button
              onClick={handleFund}
              disabled={isFundingPending || isFundingConfirming}
              className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {isFundingPending ? "Sign..." : isFundingConfirming ? "Confirm..." : "Fund"}
            </button>
          </div>

          {fundingTxHash ? (
            <a
              href={`https://basescan.org/tx/${fundingTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)] underline"
            >
              View Funding Tx
            </a>
          ) : null}
          {fundingSuccess ? (
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-emerald-700">Funding confirmed</p>
          ) : null}
          {fundingError ? (
            <p className="mt-2 font-mono text-[8px] text-red-700">{fundingError.message}</p>
          ) : null}
          {fundInputError ? (
            <p className="mt-2 font-mono text-[8px] text-red-700">{fundInputError}</p>
          ) : null}
        </div>
      </section>

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Open Positions ({data.totals.openPositions})
        </h2>
        {data.open.length === 0 ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">No open positions.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--rule-light)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Current</th>
                  <th className="py-2 pr-3">Notional</th>
                  <th className="py-2 pr-3">Unrealized</th>
                  <th className="py-2 pr-0">Opened</th>
                </tr>
              </thead>
              <tbody>
                {data.open.map((row) => (
                  <tr key={row.position.id} className="border-b border-[var(--rule-light)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">{symbolForPosition(row.position)}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">{formatUsd(row.position.entryPriceUsd)}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">{formatUsd(row.currentPriceUsd)}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">{formatUsd(row.position.entryNotionalUsd)}</td>
                    <td className={`py-2 pr-3 font-mono text-[10px] ${pnlClass(row.unrealizedPnlUsd)}`}>
                      {formatUsd(row.unrealizedPnlUsd)} ({formatPct(row.unrealizedPnlPct)})
                    </td>
                    <td className="py-2 pr-0 font-mono text-[10px] text-[var(--ink-faint)]">
                      {new Date(row.position.openedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border border-[var(--rule-light)] p-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Closed Positions ({data.totals.closedPositions})
        </h2>
        {closedRows.length === 0 ? (
          <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">No closed positions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--rule-light)] font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  <th className="py-2 pr-3">Market</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Exit</th>
                  <th className="py-2 pr-3">Realized</th>
                  <th className="py-2 pr-0">Closed</th>
                </tr>
              </thead>
              <tbody>
                {closedRows.map((row) => (
                  <tr key={row.position.id} className="border-b border-[var(--rule-light)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink)]">{symbolForPosition(row.position)}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">{formatUsd(row.position.entryPriceUsd)}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-[var(--ink-light)]">{formatUsd(row.position.exitPriceUsd)}</td>
                    <td className={`py-2 pr-3 font-mono text-[10px] ${pnlClass(row.realizedPnlUsd)}`}>
                      {formatUsd(row.realizedPnlUsd)} ({formatPct(row.realizedPnlPct)})
                    </td>
                    <td className="py-2 pr-0 font-mono text-[10px] text-[var(--ink-faint)]">
                      {row.position.closedAt ? new Date(row.position.closedAt).toLocaleString() : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border border-[var(--rule-light)] p-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">{label}</p>
      <p className={`mt-1 font-headline text-xl ${valueClass ?? "text-[var(--ink)]"}`}>{value}</p>
    </div>
  );
}
