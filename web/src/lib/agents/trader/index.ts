// ─── Trader Agent — Trading Engine Wrapper ───────────────────────────────────
//
// Wraps the existing TraderEngine as a proper Agent in the swarm.
// Runs trading cycles on interval, publishes trade events to the bus,
// and exposes live position/P&L telemetry via snapshot().

import { randomUUID } from "node:crypto";
import { reportWarn } from "@/lib/report-error";
import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import {
  runTraderCycles,
  getTraderPerformance,
  redactedConfigSummary,
} from "@/lib/trading/engine";
import { positionsToJournal } from "@/lib/trading/trade-journal";
import { consecutiveLosses } from "@/lib/trading/kelly";
import type {
  Position,
  TraderCycleReport,
  TraderPerformanceReport,
  TraderPerformanceTotals,
  TradeJournalEntry,
} from "@/lib/trading/types";

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CYCLE_INTERVAL_MS = 90_000; // 90 seconds

const SERVERLESS_RUNTIME =
  process.env.VERCEL === "1" ||
  process.env.AWS_EXECUTION_ENV?.toLowerCase().includes("lambda") === true ||
  process.env.RAILWAY_ENVIRONMENT !== undefined;

const BACKGROUND_ENABLED =
  process.env.TRADER_ENABLE_BACKGROUND_CYCLE === "true";

// ─── Agent Implementation ────────────────────────────────────────────────────

class TraderAgent implements Agent {
  readonly id = "trader";
  readonly name = "Trader";
  readonly description =
    "Executes trading cycles, manages positions on Base L2 / Hyperliquid, enforces circuit breaker";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private errors: string[] = [];
  private cycling = false;

  // Accumulated stats
  private cyclesRun = 0;
  private totalEntries = 0;
  private totalExits = 0;
  private lastCircuitBreakerTripped = false;
  private lastConsecutiveLosses = 0;

  // Cached performance (updated after each cycle for synchronous snapshot())
  private cachedTotals: TraderPerformanceTotals | null = null;
  private cachedJournal: TradeJournalEntry[] = [];
  private cachedDryRun = true;
  private cachedVenue = "base-spot";
  private lastReport: TraderCycleReport | null = null;

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;

    this._status = "starting";
    this.startedAt = Date.now();
    this.errors = [];

    if (!BACKGROUND_ENABLED || SERVERLESS_RUNTIME) {
      console.log("[TraderAgent] Using on-demand cycle mode");
      this._status = "running";
      return;
    }

    console.log(
      `[TraderAgent] Starting cycle loop (${DEFAULT_CYCLE_INTERVAL_MS / 1000}s interval)`
    );

    // Initial cycle
    void this.runCycle();

    // Recurring cycle
    const intervalMs =
      Number(process.env.TRADER_CYCLE_INTERVAL_MS) || DEFAULT_CYCLE_INTERVAL_MS;
    this.cycleTimer = setInterval(() => {
      void this.runCycle();
    }, intervalMs);

    this._status = "running";
  }

  stop(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this._status = "idle";
    console.log("[TraderAgent] Stopped");
  }

  /**
   * Run a trading cycle through the agent (centralizes all execution).
   * Called by the API route and by the internal timer.
   * Returns the same shape as runTraderCycles() for API compatibility.
   */
  async runCycleNow(): Promise<{
    primary: TraderCycleReport;
    parallel: Array<{ runnerId: string; label: string; report: TraderCycleReport }>;
  }> {
    // If already cycling, wait for it to finish rather than overlapping
    if (this.cycling) {
      const waitStart = Date.now();
      while (this.cycling && Date.now() - waitStart < 55_000) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // Return last report if we timed out waiting
      if (this.cycling && this.lastReport) {
        return { primary: this.lastReport, parallel: [] };
      }
    }

    return this.runCycle();
  }

  snapshot(): AgentSnapshot {
    const now = Date.now();
    const totals = this.cachedTotals;
    const closed = this.cachedJournal.filter((j) => j.pnlUsd !== undefined);
    const wins = closed.filter((j) => (j.pnlUsd ?? 0) > 0);

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        cyclesRun: this.cyclesRun,
        activePositions: totals?.openPositions ?? 0,
        totalTrades:
          (totals?.openPositions ?? 0) + (totals?.closedPositions ?? 0),
        realizedPnlUsd:
          Math.round((totals?.realizedPnlUsd ?? 0) * 100) / 100,
        unrealizedPnlUsd:
          Math.round((totals?.unrealizedPnlUsd ?? 0) * 100) / 100,
        deployedUsd: Math.round((totals?.deployedUsd ?? 0) * 100) / 100,
        winRate:
          Math.round(
            (closed.length > 0 ? wins.length / closed.length : 0) * 1000
          ) / 10,
        consecutiveLosses: this.lastConsecutiveLosses,
        circuitBreakerActive: this.lastCircuitBreakerTripped ? 1 : 0,
        dryRun: this.cachedDryRun ? 1 : 0,
        uptimeSeconds: this.startedAt
          ? Math.floor((now - this.startedAt) / 1000)
          : 0,
      },
      errors: this.errors.slice(-10),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async runCycle(): Promise<{
    primary: TraderCycleReport;
    parallel: Array<{ runnerId: string; label: string; report: TraderCycleReport }>;
  }> {
    if (this.cycling) {
      // Return last report to avoid overlapping cycles
      return {
        primary: this.lastReport ?? this.emptyReport(),
        parallel: [],
      };
    }

    this.cycling = true;

    try {
      this.cyclesRun++;
      const result = await runTraderCycles();
      const report = result.primary;
      this.lastReport = report;
      this.lastActivityAt = Date.now();
      this.cachedDryRun = report.dryRun;
      this.cachedVenue = report.executionVenue;

      // Detect circuit breaker from report errors
      const cbTripped = report.errors.some((e) =>
        e.startsWith("circuit-breaker:")
      );

      // Publish events for new entries
      for (const entry of report.entries) {
        this.totalEntries++;
        await this.publishTradeExecuted(entry);
      }

      // Publish events for exits
      for (const exit of report.exits) {
        this.totalExits++;
        await this.publishPositionClosed(exit);
      }

      // Circuit breaker event (only on transition to tripped)
      if (cbTripped && !this.lastCircuitBreakerTripped) {
        await this.publishCircuitBreakerTripped(report);
      }
      this.lastCircuitBreakerTripped = cbTripped;

      // Update cached performance for snapshot()
      try {
        const perf = await getTraderPerformance();
        this.cachedTotals = perf.totals;
        const allPositions = [
          ...perf.open.map((o) => o.position),
          ...perf.closed.map((c) => c.position),
        ];
        this.cachedJournal = positionsToJournal(allPositions);
        this.lastConsecutiveLosses = consecutiveLosses(this.cachedJournal);
      } catch (e) {
        reportWarn("trader:snapshot", e);
      }

      // Always publish cycle-complete
      await this.publishCycleComplete(report);

      console.log(
        `[TraderAgent] Cycle #${this.cyclesRun}: ${report.entries.length} entries, ${report.exits.length} exits, ${report.openPositions} open, CB=${cbTripped}`
      );

      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.errors.push(`[${new Date().toISOString()}] ${errMsg}`);
      if (this.errors.length > 20) this.errors = this.errors.slice(-20);
      console.error("[TraderAgent] Cycle error:", errMsg);

      return {
        primary: this.lastReport ?? this.emptyReport(),
        parallel: [],
      };
    } finally {
      this.cycling = false;
    }
  }

  // ─── Bus Events ─────────────────────────────────────────────────────────

  private async publishTradeExecuted(position: Position): Promise<void> {
    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "trade-executed",
      payload: {
        positionId: position.id,
        tokenAddress: position.tokenAddress,
        marketSymbol: position.marketSymbol,
        direction: position.direction ?? "long",
        entryPriceUsd: position.entryPriceUsd,
        entryNotionalUsd: position.entryNotionalUsd,
        venue: position.venue,
        leverage: position.leverage,
      },
      timestamp: Date.now(),
    });
  }

  private async publishPositionClosed(position: Position): Promise<void> {
    const pnlUsd =
      position.exitPriceUsd != null && position.entryPriceUsd > 0
        ? position.entryNotionalUsd *
          ((position.direction === "short"
            ? position.entryPriceUsd - position.exitPriceUsd
            : position.exitPriceUsd - position.entryPriceUsd) /
            position.entryPriceUsd)
        : 0;

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "position-closed",
      payload: {
        positionId: position.id,
        tokenAddress: position.tokenAddress,
        marketSymbol: position.marketSymbol,
        direction: position.direction ?? "long",
        exitReason: position.exitReason,
        exitPriceUsd: position.exitPriceUsd,
        pnlUsd: Math.round(pnlUsd * 100) / 100,
        isLoss: pnlUsd < 0,
      },
      timestamp: Date.now(),
    });
  }

  private async publishCircuitBreakerTripped(
    report: TraderCycleReport
  ): Promise<void> {
    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "circuit-breaker-tripped",
      payload: {
        consecutiveLosses: this.lastConsecutiveLosses,
        venue: report.executionVenue,
        dryRun: report.dryRun,
      },
      timestamp: Date.now(),
    });
  }

  private async publishCycleComplete(
    report: TraderCycleReport
  ): Promise<void> {
    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "trader-cycle-complete",
      payload: {
        cyclesRun: this.cyclesRun,
        entries: report.entries.length,
        exits: report.exits.length,
        openPositions: report.openPositions,
        scannerCandidates: report.scannerCandidates,
        errorsCount: report.errors.length,
        circuitBreakerActive: this.lastCircuitBreakerTripped,
        durationMs: report.finishedAt - report.startedAt,
        venue: report.executionVenue,
        dryRun: report.dryRun,
      },
      timestamp: Date.now(),
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private emptyReport(): TraderCycleReport {
    const now = Date.now();
    return {
      startedAt: now,
      finishedAt: now,
      dryRun: true,
      executionVenue: "base-spot",
      scannerCandidates: 0,
      openPositions: 0,
      entries: [],
      exits: [],
      skipped: [],
      errors: ["no-cycle-data"],
    };
  }
}

// ─── Singleton + Auto-Register ──────────────────────────────────────────────

const traderAgent = new TraderAgent();
agentRegistry.register(traderAgent);

export { traderAgent };
