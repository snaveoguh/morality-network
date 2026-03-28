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

type PositionClosedPayload = {
  isLoss?: boolean;
};

type TraderCyclePayload = {
  circuitBreakerActive?: boolean;
};

// Base cooldowns — dynamically scaled by cooldownMultiplier when trader is struggling
const BASE_SCORE_REQUEST_COOLDOWN_MS = 3 * 60 * 1000;
const BASE_TRADE_SIGNAL_COOLDOWN_MS = 2 * 60 * 1000;

// Throttle multipliers
const NORMAL_MULTIPLIER = 1.0;
const ELEVATED_MULTIPLIER = 1.5; // High loss rate (≥3 losses since last reset)
const STRESSED_MULTIPLIER = 3.0; // Circuit breaker active

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
  private tradeCandidatesSuppressed = 0;
  private emergingEventsSeen = 0;
  private contradictionsSeen = 0;
  private spawnedAgents = 0;

  // Trader feedback state
  private traderCircuitBreakerActive = false;
  private traderLossCount = 0;
  private traderCyclesSeen = 0;
  private tradePaused = false;
  private cooldownMultiplier = NORMAL_MULTIPLIER;

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
      // Trader feedback loop
      messageBus.subscribe("trade-executed", (message) => this.onTradeExecuted(message)),
      messageBus.subscribe("position-closed", (message) => this.onPositionClosed(message)),
      messageBus.subscribe("circuit-breaker-tripped", (message) => this.onCircuitBreakerTripped(message)),
      messageBus.subscribe("trader-cycle-complete", (message) => this.onTraderCycleComplete(message)),
      // Governance alpha signals
      messageBus.subscribe("governance-alpha", (message) => this.onGovernanceAlpha(message)),
      // Autoresearch experiment events
      messageBus.subscribe("experiment-started", (message) => {
        console.log(`[coordinator] Experiment started: ${(message.payload as Record<string, unknown>)?.id}`);
        this.lastActivityAt = Date.now();
      }),
      messageBus.subscribe("experiment-completed", (message) => {
        console.log(`[coordinator] Experiment completed: ${(message.payload as Record<string, unknown>)?.id} — ${(message.payload as Record<string, unknown>)?.status}`);
        this.lastActivityAt = Date.now();
      }),
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
        tradeCandidatesSuppressed: this.tradeCandidatesSuppressed,
        emergingEventsSeen: this.emergingEventsSeen,
        contradictionsSeen: this.contradictionsSeen,
        spawnedAgents: this.spawnedAgents,
        trackedScoreRequests: this.scoreRequestedAt.size,
        trackedTradeSignals: this.tradeSignaledAt.size,
        // Trader feedback
        traderCircuitBreakerActive: this.traderCircuitBreakerActive ? 1 : 0,
        traderLossCount: this.traderLossCount,
        tradePaused: this.tradePaused ? 1 : 0,
        cooldownMultiplier: Math.round(this.cooldownMultiplier * 100) / 100,
        traderCyclesSeen: this.traderCyclesSeen,
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
    if (now - last < BASE_SCORE_REQUEST_COOLDOWN_MS * this.cooldownMultiplier) return;

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
    // Suppress trade candidates entirely when trader circuit breaker is active
    if (this.tradePaused) {
      this.tradeCandidatesSuppressed += 1;
      return;
    }

    const now = Date.now();
    const last = this.tradeSignaledAt.get(tokenAddress) || 0;
    if (now - last < BASE_TRADE_SIGNAL_COOLDOWN_MS * this.cooldownMultiplier) return;

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

  // ─── Trader Feedback Handlers ─────────────────────────────────────────

  private onTradeExecuted(_message: AgentMessage): void {
    this.bumpActivity();
    // Informational — tracked via bus persistence
  }

  private onPositionClosed(message: AgentMessage): void {
    this.bumpActivity();
    const payload = (message.payload || {}) as PositionClosedPayload;
    if (payload.isLoss) {
      this.traderLossCount += 1;
      this.recalculateCooldownMultiplier();
    }
  }

  private onCircuitBreakerTripped(_message: AgentMessage): void {
    this.bumpActivity();
    this.traderCircuitBreakerActive = true;
    this.tradePaused = true;
    this.recalculateCooldownMultiplier();
    console.log("[Coordinator] Trader circuit breaker tripped — pausing trade-candidate emission");
  }

  private onTraderCycleComplete(message: AgentMessage): void {
    this.bumpActivity();
    this.traderCyclesSeen += 1;
    const payload = (message.payload || {}) as TraderCyclePayload;

    // Detect recovery: circuit breaker was active but trader reports it's now clear
    if (this.traderCircuitBreakerActive && payload.circuitBreakerActive === false) {
      this.traderCircuitBreakerActive = false;
      this.tradePaused = false;
      this.traderLossCount = 0;
      this.recalculateCooldownMultiplier();
      console.log("[Coordinator] Trader recovered from circuit breaker — resuming normal cooldowns");
    }
  }

  /**
   * Handle governance alpha signals from the GovernanceWatcherAgent.
   * Logs the signal and publishes a boosted trade-candidate if the asset
   * matches one of the trader's watch markets.
   */
  private onGovernanceAlpha(message: AgentMessage): void {
    this.bumpActivity();
    const signal = message.payload as {
      proposalId?: string;
      protocol?: string;
      tradeableAsset?: string;
      direction?: string;
      confidence?: number;
      reasoning?: string;
      eventType?: string;
    };

    if (!signal.tradeableAsset || !signal.direction) return;

    console.log(
      `[Coordinator] Governance alpha: ${signal.tradeableAsset} ${signal.direction} ` +
      `(${signal.eventType}, conf=${signal.confidence?.toFixed(2)}) — ${signal.reasoning?.slice(0, 80)}`,
    );

    // Publish as a trade-candidate so the trader can pick it up
    // The trader's composite signal will integrate this as a news-like signal
    void messageBus.publish({
      id: randomUUID(),
      from: this.id,
      to: "*",
      topic: "governance-trade-signal",
      payload: {
        symbol: signal.tradeableAsset,
        direction: signal.direction,
        confidence: signal.confidence ?? 0.3,
        source: `governance:${signal.protocol}`,
        reasoning: signal.reasoning,
        eventType: signal.eventType,
        proposalId: signal.proposalId,
      },
      timestamp: Date.now(),
    });
  }

  private recalculateCooldownMultiplier(): void {
    if (this.traderCircuitBreakerActive) {
      this.cooldownMultiplier = STRESSED_MULTIPLIER;
      return;
    }
    if (this.traderLossCount >= 3) {
      this.cooldownMultiplier = ELEVATED_MULTIPLIER;
      return;
    }
    this.cooldownMultiplier = NORMAL_MULTIPLIER;
  }

  // ─── Watcher Spawning ──────────────────────────────────────────────────

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
