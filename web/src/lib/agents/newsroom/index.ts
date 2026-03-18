// ─── Newsroom Agent — Pooter Originals Publisher ─────────────────────────────
//
// Curates and generates 10 compelling editorial pieces per day from RSS feeds.
// Enforces topic diversity (max 2 per topic, max 1 per source).
// Publishes "pooter-original-published" events to the message bus.
// Runs via Vercel cron (every 2 hours) — no background polling in serverless.

import { randomUUID } from "node:crypto";
import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import { runNewsroom, type NewsroomResult } from "@/lib/newsroom";

// ─── Agent Implementation ────────────────────────────────────────────────────

class NewsroomAgent implements Agent {
  readonly id = "newsroom";
  readonly name = "Newsroom";
  readonly description =
    "Curates 10 compelling Pooter Original editorials per day — diverse topics, multi-source synthesis";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private lastRunResult: NewsroomResult | null = null;
  private totalStoriesPublished = 0;
  private totalRuns = 0;
  private errors: string[] = [];

  start(): void {
    if (this._status === "running") return;
    this._status = "running";
    this.startedAt = Date.now();
    console.log("[newsroom-agent] Started (cron-driven, no background polling)");
  }

  stop(): void {
    this._status = "idle";
    console.log("[newsroom-agent] Stopped");
  }

  status(): AgentStatus {
    return this._status;
  }

  /**
   * Run the newsroom pipeline. Called by /api/newsroom cron route.
   * Returns the full NewsroomResult for API response.
   */
  async runNow(): Promise<NewsroomResult> {
    this.lastActivityAt = Date.now();
    this.totalRuns++;

    try {
      const result = await runNewsroom({ maxStories: 10 });
      this.lastRunResult = result;
      this.totalStoriesPublished += result.generated;

      // Publish events for each generated story
      for (const detail of result.details) {
        if (detail.status === "generated") {
          messageBus.publish({
            id: randomUUID(),
            from: this.id,
            to: "*",
            topic: "pooter-original-published",
            payload: {
              hash: detail.hash,
              title: detail.title,
              generatedAt: new Date().toISOString(),
            },
            timestamp: Date.now(),
          });
        }
      }

      console.log(
        `[newsroom-agent] Run complete: ${result.generated} generated, ${result.skipped} skipped, ${result.errors} errors`,
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      this.errors.push(`${new Date().toISOString()}: ${msg}`);
      if (this.errors.length > 20) this.errors.shift();
      throw err;
    }
  }

  snapshot(): AgentSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        totalRuns: this.totalRuns,
        totalStoriesPublished: this.totalStoriesPublished,
        lastRunGenerated: this.lastRunResult?.generated ?? 0,
        lastRunSkipped: this.lastRunResult?.skipped ?? 0,
        lastRunErrors: this.lastRunResult?.errors ?? 0,
        todayStories: this.lastRunResult?.edition.stories.length ?? 0,
      },
      errors: this.errors.slice(-5),
    };
  }
}

// ─── Singleton & Registration ────────────────────────────────────────────────

const newsroomAgent = new NewsroomAgent();
agentRegistry.register(newsroomAgent);

export { newsroomAgent };
