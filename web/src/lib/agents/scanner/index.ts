// ─── Scanner Agent — Entry Point ────────────────────────────────────────────
//
// ScannerAgent implements the Agent interface. Polls for new token launches
// on Base mainnet DEXes, scores them, and publishes discoveries to the bus.

import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import { poll, launchStore } from "./watcher";
import { scoreLaunch } from "./analyzer";
import { API_POLL_COOLDOWN_MS, POLL_INTERVAL_MS } from "./constants";
import type { TokenLaunch } from "./types";

const SERVERLESS_RUNTIME =
  process.env.VERCEL === "1" ||
  process.env.AWS_EXECUTION_ENV?.toLowerCase().includes("lambda") === true ||
  process.env.RAILWAY_ENVIRONMENT !== undefined;
const BACKGROUND_POLL_ENABLED = process.env.SCANNER_ENABLE_BACKGROUND_POLL === "true";

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
  private lastPollStartedAt: number | null = null;
  private lastPollFinishedAt: number | null = null;

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

    if (!BACKGROUND_POLL_ENABLED || SERVERLESS_RUNTIME) {
      // Polling is request-driven by default to support serverless runtimes.
      // Enable interval polling explicitly with SCANNER_ENABLE_BACKGROUND_POLL=true.
      console.log("[ScannerAgent] Using on-demand polling mode");
      this._status = "running";
      return;
    }

    // Initial poll immediately
    void this.runPoll("startup");

    // Recurring poll (non-serverless runtimes only)
    this.pollTimer = setInterval(() => {
      void this.runPoll("interval");
    }, POLL_INTERVAL_MS);
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

  async pollNow(options?: { force?: boolean; reason?: string }): Promise<boolean> {
    if (this.polling) {
      return false;
    }

    const now = Date.now();
    const force = options?.force === true;
    const reason = options?.reason ?? "api";

    if (
      !force &&
      this.lastPollFinishedAt &&
      now - this.lastPollFinishedAt < API_POLL_COOLDOWN_MS
    ) {
      return false;
    }

    await this.runPoll(reason);
    return true;
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
        totalDiscovered: this.totalDiscovered,
        lastPollStartedAt: this.lastPollStartedAt ?? 0,
        lastPollFinishedAt: this.lastPollFinishedAt ?? 0,
        uptimeSeconds: this.startedAt
          ? Math.floor((now - this.startedAt) / 1000)
          : 0,
      },
      errors: this.errors.slice(-5),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async runPoll(trigger: string): Promise<void> {
    if (this.polling) return; // Prevent overlapping polls
    this.polling = true;
    this.lastPollStartedAt = Date.now();

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
      console.error(`[ScannerAgent] Poll error (${trigger}):`, errMsg);
    } finally {
      this.lastPollFinishedAt = Date.now();
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
