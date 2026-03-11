import { randomUUID } from "node:crypto";
import { messageBus } from "../core/bus";
import { agentRegistry } from "../core/registry";
import type { Agent, AgentMessage, AgentSnapshot, AgentStatus } from "../core/types";
import { agentFactory } from "../factory";

type ScoreResultPayload = {
  address?: string;
  score?: number;
  breakdown?: unknown;
};

type LaunchPayload = {
  tokenAddress?: string;
  poolAddress?: string;
  score?: number;
  breakdown?: unknown;
};

type ContradictionPayload = {
  count?: number;
};

const SCORE_REQUEST_COOLDOWN_MS = 3 * 60 * 1000;
const TRADE_SIGNAL_COOLDOWN_MS = 2 * 60 * 1000;

class BusCoordinatorAgent implements Agent {
  readonly id = "bus-coordinator";
  readonly name = "Bus Coordinator";
  readonly description =
    "Consumes scanner/swarm events, requests scores, emits trade candidates, and spawns helper agents.";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private readonly errors: string[] = [];
  private readonly unsubs: Array<() => void> = [];
  private readonly scoreRequestedAt = new Map<string, number>();
  private readonly tradeSignaledAt = new Map<string, number>();
  private spawnedWatcherTopics = new Set<string>();

  private messageCount = 0;
  private scoreRequestsSent = 0;
  private scoreResultsSeen = 0;
  private tradeCandidatesPublished = 0;
  private emergingEventsSeen = 0;
  private contradictionsSeen = 0;
  private spawnedAgents = 0;

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;

    this._status = "starting";
    this.startedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.spawnedWatcherTopics = new Set(agentFactory.snapshot().ids);

    this.unsubs.push(
      messageBus.subscribe("new-token-launch", (message) => this.onLaunchMessage(message)),
      messageBus.subscribe("token-enriched", (message) => this.onLaunchMessage(message)),
      messageBus.subscribe("high-score-launch", (message) => this.onHighScoreLaunch(message)),
      messageBus.subscribe("score-result", (message) => this.onScoreResult(message)),
      messageBus.subscribe("emerging-event", (message) => this.onEmergingEvent(message)),
      messageBus.subscribe("contradictions-detected", (message) => this.onContradictions(message)),
      messageBus.subscribeDirect(this.id, (message) => this.onDirectMessage(message))
    );

    this._status = "running";
  }

  stop(): void {
    this._status = "stopping";
    for (const unsub of this.unsubs.splice(0)) {
      try {
        unsub();
      } catch (error) {
        this.pushError(error);
      }
    }
    this._status = "idle";
  }

  snapshot(): AgentSnapshot {
    const now = Date.now();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        messageCount: this.messageCount,
        scoreRequestsSent: this.scoreRequestsSent,
        scoreResultsSeen: this.scoreResultsSeen,
        tradeCandidatesPublished: this.tradeCandidatesPublished,
        emergingEventsSeen: this.emergingEventsSeen,
        contradictionsSeen: this.contradictionsSeen,
        spawnedAgents: this.spawnedAgents,
        trackedScoreRequests: this.scoreRequestedAt.size,
        trackedTradeSignals: this.tradeSignaledAt.size,
        uptimeSeconds: this.startedAt ? Math.floor((now - this.startedAt) / 1000) : 0,
      },
      errors: this.errors.slice(-10),
    };
  }

  private onDirectMessage(message: AgentMessage): void {
    this.bumpActivity();
    if (message.topic === "score-result") {
      void this.onScoreResult(message);
    }
  }

  private onLaunchMessage(message: AgentMessage): void {
    this.bumpActivity();
    const payload = (message.payload || {}) as LaunchPayload;
    const tokenAddress = payload.tokenAddress?.toLowerCase();
    if (!tokenAddress || !/^0x[a-f0-9]{40}$/i.test(tokenAddress)) return;

    void this.requestScore(tokenAddress, message.topic);
  }

  private async onHighScoreLaunch(message: AgentMessage): Promise<void> {
    this.bumpActivity();
    const payload = (message.payload || {}) as LaunchPayload;
    const tokenAddress = payload.tokenAddress?.toLowerCase();
    if (!tokenAddress || !/^0x[a-f0-9]{40}$/i.test(tokenAddress)) return;
    const score = Number(payload.score || 0);
    await this.publishTradeCandidate(tokenAddress, score, "high-score-launch", payload.breakdown);
  }

  private async onScoreResult(message: AgentMessage): Promise<void> {
    this.bumpActivity();
    this.scoreResultsSeen += 1;
    const payload = (message.payload || {}) as ScoreResultPayload;
    const tokenAddress = payload.address?.toLowerCase();
    if (!tokenAddress || !/^0x[a-f0-9]{40}$/i.test(tokenAddress)) return;

    const score = Number(payload.score || 0);
    if (score < 50) return;

    await this.publishTradeCandidate(tokenAddress, score, "score-result", payload.breakdown);
  }

  private async onEmergingEvent(message: AgentMessage): Promise<void> {
    this.bumpActivity();
    this.emergingEventsSeen += 1;

    const payload = message.payload as { hasContradictions?: boolean; title?: string };
    if (payload?.hasContradictions !== true) return;

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "research-escalation",
      payload: {
        reason: "contradiction-in-emerging-event",
        title: payload.title || "untitled",
      },
      timestamp: Date.now(),
    });
  }

  private async onContradictions(message: AgentMessage): Promise<void> {
    this.bumpActivity();
    const payload = (message.payload || {}) as ContradictionPayload;
    const count = Number(payload.count || 0);
    this.contradictionsSeen += count || 1;

    if (count < 2) return;
    await this.spawnWatcher("emerging-event", 5);
    await this.spawnWatcher("trade-candidate", 4);
  }

  private async requestScore(tokenAddress: string, reason: string): Promise<void> {
    const now = Date.now();
    const last = this.scoreRequestedAt.get(tokenAddress) || 0;
    if (now - last < SCORE_REQUEST_COOLDOWN_MS) return;

    this.scoreRequestedAt.set(tokenAddress, now);
    this.scoreRequestsSent += 1;

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "launch-scanner",
      topic: "score-request",
      payload: { address: tokenAddress, reason },
      timestamp: now,
    });
  }

  private async publishTradeCandidate(
    tokenAddress: string,
    score: number,
    source: string,
    breakdown: unknown
  ): Promise<void> {
    const now = Date.now();
    const last = this.tradeSignaledAt.get(tokenAddress) || 0;
    if (now - last < TRADE_SIGNAL_COOLDOWN_MS) return;

    this.tradeSignaledAt.set(tokenAddress, now);
    this.tradeCandidatesPublished += 1;

    await messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "trade-candidate",
      payload: {
        tokenAddress,
        score,
        source,
        breakdown,
      },
      timestamp: now,
    });
  }

  private async spawnWatcher(topic: string, burstSize: number): Promise<void> {
    if (this.spawnedWatcherTopics.has(`watch-${topic}`)) return;
    const result = agentFactory.spawnTopicWatcher(topic, this.id, burstSize);
    if (result.created) {
      this.spawnedAgents += 1;
      this.spawnedWatcherTopics.add(result.id);
      return;
    }
    if (result.reason === "already-exists") {
      this.spawnedWatcherTopics.add(result.id);
      return;
    }
    if (result.reason) {
      this.pushError(`spawn:${topic}:${result.reason}`);
    }
  }

  private bumpActivity(): void {
    this.messageCount += 1;
    this.lastActivityAt = Date.now();
  }

  private pushError(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    this.errors.push(msg);
    if (this.errors.length > 20) {
      this.errors.splice(0, this.errors.length - 20);
    }
  }
}

const coordinatorAgent = new BusCoordinatorAgent();
agentRegistry.register(coordinatorAgent);

export { coordinatorAgent };
