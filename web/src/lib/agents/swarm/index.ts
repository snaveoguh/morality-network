// ─── Swarm Agent — Research Swarm Wrapper ───────────────────────────────────
//
// Wraps the existing agent-swarm.ts as a proper Agent.
// Polls RSS feeds every 5 minutes, clusters events, publishes top emerging
// stories to the message bus. Does NOT modify agent-swarm.ts.

import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import {
  runResearchSwarm,
  type AgentSwarmOutput,
  type EmergingEventCluster,
} from "@/lib/agent-swarm";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TOP_EMERGING_COUNT = 5;

class SwarmAgent implements Agent {
  readonly id = "research-swarm";
  readonly name = "Research Swarm";
  readonly description =
    "Clusters RSS feeds into emerging events, detects contradictions across sources";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private errors: string[] = [];
  private pollCount = 0;
  private lastOutput: AgentSwarmOutput | null = null;

  status(): AgentStatus {
    return this._status;
  }

  /** Get the latest swarm output (used by API route) */
  getLastOutput(): AgentSwarmOutput | null {
    return this.lastOutput;
  }

  start(): void {
    if (this._status === "running") return;

    this._status = "starting";
    this.startedAt = Date.now();
    this.errors = [];

    console.log(
      `[SwarmAgent] Starting poll loop (${POLL_INTERVAL_MS / 1000}s interval)`
    );

    // Initial poll
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
    console.log("[SwarmAgent] Stopped");
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
        pollCount: this.pollCount,
        clusters: this.lastOutput?.clusters.length ?? 0,
        scannedItems: this.lastOutput?.scannedItems ?? 0,
        contradictions: this.lastOutput?.contradictionFlags.length ?? 0,
        uptimeSeconds: this.startedAt
          ? Math.floor((Date.now() - this.startedAt) / 1000)
          : 0,
      },
      errors: this.errors.slice(-5),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async runPoll(): Promise<void> {
    try {
      this.pollCount++;

      // Fetch RSS feeds
      const items = await fetchAllFeeds(DEFAULT_FEEDS);

      // Run the swarm clustering
      const output = runResearchSwarm(items, 30);
      this.lastOutput = output;
      this.lastActivityAt = Date.now();

      // Publish top emerging events to bus
      const topClusters = output.clusters.slice(0, TOP_EMERGING_COUNT);
      for (const cluster of topClusters) {
        await messageBus.publish({
          id: crypto.randomUUID(),
          from: this.id,
          to: "*",
          topic: "emerging-event",
          payload: {
            clusterId: cluster.clusterId,
            title: cluster.title,
            canonicalClaim: cluster.canonicalClaim,
            itemCount: cluster.itemCount,
            sources: cluster.sources,
            tags: cluster.tags,
            hasContradictions: cluster.contradictionFlags.length > 0,
          },
          timestamp: Date.now(),
        });
      }

      if (output.contradictionFlags.length > 0) {
        await messageBus.publish({
          id: crypto.randomUUID(),
          from: this.id,
          to: "*",
          topic: "contradictions-detected",
          payload: {
            count: output.contradictionFlags.length,
            flags: output.contradictionFlags.slice(0, 5),
          },
          timestamp: Date.now(),
        });
      }

      console.log(
        `[SwarmAgent] Poll #${this.pollCount}: ${output.scannedItems} items → ${output.clusters.length} clusters, ${output.contradictionFlags.length} contradictions`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.errors.push(`[${new Date().toISOString()}] ${errMsg}`);
      if (this.errors.length > 20) this.errors = this.errors.slice(-20);
      console.error("[SwarmAgent] Poll error:", errMsg);
    }
  }
}

// ─── Singleton + Auto-Register ──────────────────────────────────────────────

const swarmAgent = new SwarmAgent();
agentRegistry.register(swarmAgent);

export { swarmAgent };
