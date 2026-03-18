// ─── Scalper Agent — WebSocket Minute-Candle Scalping Agent ────────────────
//
// Wraps ScalperManager as a proper Agent in the swarm so it appears
// on /bots and publishes trade events to the message bus.

import { randomUUID } from "node:crypto";
import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import { ScalperManager } from "@/lib/trading/scalper";
import { getTraderConfig, getScalperConfig } from "@/lib/trading/config";
import { getTraderExecutionMode } from "@/lib/runtime-mode";
import type { ScalpPosition } from "@/lib/trading/types";

class ScalperAgent implements Agent {
  readonly id = "scalper";
  readonly name = "Scalper";
  readonly description =
    "Real-time 1m candle scalper on Hyperliquid — detects big moves, volume spikes, and VWAP breakouts via WebSocket";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private errors: string[] = [];
  private manager: ScalperManager | null = null;

  // Stats tracking
  private signalsDetected = 0;
  private tradesOpened = 0;
  private tradesClosed = 0;
  private totalPnlUsd = 0;

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;

    const scalperConfig = getScalperConfig();
    if (!scalperConfig.enabled) {
      console.log("[ScalperAgent] Disabled via SCALPER_ENABLED=false");
      return;
    }

    if (getTraderExecutionMode() !== "worker") {
      console.log("[ScalperAgent] Skipped — requires TRADER_EXECUTION_MODE=worker");
      return;
    }

    const traderConfig = getTraderConfig();
    if (traderConfig.executionVenue !== "hyperliquid-perp") {
      console.log("[ScalperAgent] Skipped — requires hyperliquid-perp venue");
      return;
    }

    this._status = "starting";
    this.startedAt = Date.now();

    this.manager = new ScalperManager(traderConfig, scalperConfig);
    this.manager
      .start()
      .then(() => {
        this._status = "running";
        console.log(
          `[ScalperAgent] Running — markets: ${scalperConfig.markets.join(", ")}, dryRun: ${scalperConfig.dryRun}`,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.errors.push(`[${new Date().toISOString()}] start failed: ${msg}`);
        this._status = "error";
        console.error("[ScalperAgent] Start failed:", msg);
      });
  }

  stop(): void {
    if (this.manager) {
      this.manager
        .stop()
        .catch(() => {});
      this.manager = null;
    }
    this._status = "idle";
    console.log("[ScalperAgent] Stopped");
  }

  snapshot(): AgentSnapshot {
    const scalperConfig = getScalperConfig();
    const now = Date.now();

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        markets: scalperConfig.markets.length,
        leverage: scalperConfig.defaultLeverage,
        maxPositionUsd: scalperConfig.maxPositionUsd,
        maxOpenScalps: scalperConfig.maxOpenScalps,
        signalsDetected: this.signalsDetected,
        tradesOpened: this.tradesOpened,
        tradesClosed: this.tradesClosed,
        totalPnlUsd: Math.round(this.totalPnlUsd * 100) / 100,
        dryRun: scalperConfig.dryRun ? 1 : 0,
        uptimeSeconds: this.startedAt
          ? Math.floor((now - this.startedAt) / 1000)
          : 0,
      },
      errors: this.errors.slice(-10),
    };
  }

  /** Called by the worker to report a scalp signal was detected */
  recordSignal(): void {
    this.signalsDetected++;
    this.lastActivityAt = Date.now();
  }

  /** Called by the worker to report a scalp trade was opened */
  async recordOpen(scalp: ScalpPosition): Promise<void> {
    this.tradesOpened++;
    this.lastActivityAt = Date.now();

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "scalp-opened",
      payload: {
        scalpId: scalp.id,
        symbol: scalp.symbol,
        direction: scalp.direction,
        entryPriceUsd: scalp.entryPriceUsd,
        notionalUsd: scalp.notionalUsd,
        leverage: scalp.leverage,
        signalSource: scalp.signal.trigger,
        stopLoss: scalp.stopLossPriceUsd,
        takeProfit: scalp.takeProfitPriceUsd,
      },
      timestamp: Date.now(),
    });
  }

  /** Called by the worker to report a scalp trade was closed */
  async recordClose(scalp: ScalpPosition): Promise<void> {
    this.tradesClosed++;
    this.totalPnlUsd += scalp.pnlUsd ?? 0;
    this.lastActivityAt = Date.now();

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "scalp-closed",
      payload: {
        scalpId: scalp.id,
        symbol: scalp.symbol,
        direction: scalp.direction,
        exitReason: scalp.exitReason,
        exitPriceUsd: scalp.exitPriceUsd,
        pnlUsd: scalp.pnlUsd != null ? Math.round(scalp.pnlUsd * 100) / 100 : null,
        holdMs: scalp.closedAt && scalp.openedAt ? scalp.closedAt - scalp.openedAt : null,
      },
      timestamp: Date.now(),
    });
  }
}

// ─── Singleton + Auto-Register ──────────────────────────────────────────────

const scalperAgent = new ScalperAgent();
agentRegistry.register(scalperAgent);

export { scalperAgent };
