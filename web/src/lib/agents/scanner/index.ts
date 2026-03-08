// ─── Scanner Agent — Entry Point ────────────────────────────────────────────
//
// ScannerAgent implements the Agent interface. Polls for new token launches
// on Base mainnet DEXes, scores them, and publishes discoveries to the bus.

import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import { poll, launchStore, getLastBlocks } from "./watcher";
import { scoreLaunch } from "./analyzer";
import { POLL_INTERVAL_MS } from "./constants";
import type { TokenLaunch } from "./types";

class ScannerAgent implements Agent {
  readonly id = "launch-scanner";
  readonly name = "Token Launch Scanner";
  readonly description =
    "Watches Base L2 DEX factories for new token launches, scores credibility";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private errors: string[] = [];
  private pollCount = 0;
  private totalDiscovered = 0;
  private polling = false;

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;

    this._status = "starting";
    this.startedAt = Date.now();
    this.errors = [];

    console.log(`[ScannerAgent] Starting poll loop (${POLL_INTERVAL_MS}ms interval)`);

    // Listen for score requests via bus
    messageBus.subscribeDirect(this.id, async (msg) => {
      if (msg.topic === "score-request") {
        const address = (msg.payload as { address?: string })?.address;
        if (address) {
          const launch = launchStore.get(address.toLowerCase());
          if (launch) {
            const { score, breakdown } = await scoreLaunch(launch);
            const scored: TokenLaunch = {
              ...launch,
              score,
              scoreBreakdown: breakdown,
            };
            launchStore.add(scored);

            await messageBus.publish({
              id: crypto.randomUUID(),
              from: this.id,
              to: msg.from,
              topic: "score-result",
              payload: { address, score, breakdown },
              timestamp: Date.now(),
            });
          }
        }
      }
    });

    // Initial poll immediately
    this.runPoll();

    // Recurring poll
    this.pollTimer = setInterval(() => this.runPoll(), POLL_INTERVAL_MS);
    this._status = "running";
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this._status = "idle";
    console.log("[ScannerAgent] Stopped");
  }

  snapshot(): AgentSnapshot {
    const allLaunches = launchStore.getAll();
    const now = Date.now();
    const oneHourAgo = (now - 3_600_000) / 1000;
    const recentLaunches = allLaunches.filter((l) => l.discoveredAt > oneHourAgo);
    const scoredLaunches = allLaunches.filter((l) => l.score > 0);
    const avgScore =
      scoredLaunches.length > 0
        ? scoredLaunches.reduce((sum, l) => sum + l.score, 0) /
          scoredLaunches.length
        : 0;

    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        totalLaunches: allLaunches.length,
        launchesLastHour: recentLaunches.length,
        avgScore: Math.round(avgScore * 10) / 10,
        pollCount: this.pollCount,
        uptimeSeconds: this.startedAt
          ? Math.floor((now - this.startedAt) / 1000)
          : 0,
      },
      errors: this.errors.slice(-5),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async runPoll(): Promise<void> {
    if (this.polling) return; // Prevent overlapping polls
    this.polling = true;

    try {
      this.pollCount++;
      const newLaunches = await poll();

      if (newLaunches.length > 0) {
        this.totalDiscovered += newLaunches.length;
        this.lastActivityAt = Date.now();

        // Score new launches in the background
        for (const launch of newLaunches) {
          this.scoreInBackground(launch);
        }
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      this.errors.push(`[${new Date().toISOString()}] ${errMsg}`);
      if (this.errors.length > 20) this.errors = this.errors.slice(-20);
      console.error("[ScannerAgent] Poll error:", errMsg);
    } finally {
      this.polling = false;
    }
  }

  private async scoreInBackground(launch: TokenLaunch): Promise<void> {
    try {
      const { score, breakdown } = await scoreLaunch(launch);
      const scored: TokenLaunch = {
        ...launch,
        score,
        scoreBreakdown: breakdown,
      };
      launchStore.add(scored);

      // Publish high-score alerts (score >= 50)
      if (score >= 50) {
        await messageBus.publish({
          id: crypto.randomUUID(),
          from: this.id,
          to: "*",
          topic: "high-score-launch",
          payload: {
            tokenAddress: launch.tokenAddress,
            poolAddress: launch.poolAddress,
            symbol: launch.tokenMeta?.symbol ?? "???",
            score,
            dex: launch.dex,
            breakdown,
          },
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error(
        `[ScannerAgent] Scoring failed for ${launch.tokenAddress}:`,
        err
      );
    }
  }
}

// ─── Singleton + Auto-Register ──────────────────────────────────────────────

const scannerAgent = new ScannerAgent();
agentRegistry.register(scannerAgent);

export { scannerAgent, launchStore };
export type { TokenLaunch, ScannerState, ScoreBreakdown, DexId } from "./types";
