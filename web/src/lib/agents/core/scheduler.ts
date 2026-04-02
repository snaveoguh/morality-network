/**
 * scheduler.ts — Manages lifecycle of 67 emergent agents in one Node.js process.
 *
 * Staggered scheduling: max N agents active simultaneously.
 * Each agent's observe→reflect→act→learn loop runs on its own interval.
 * Agents earn faster scheduling through reputation.
 * Priority lanes: agents with open positions get priority.
 */

import type { Agent, AgentSnapshot } from "./types";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface ScheduledAgent {
  agent: Agent;
  /** Base interval in ms between cycles (default 15 min) */
  baseIntervalMs: number;
  /** Effective interval (adjusted by reputation — high rep = faster) */
  effectiveIntervalMs: number;
  /** Priority (higher = runs first when slots available) */
  priority: number;
  /** Whether this agent is currently executing a cycle */
  running: boolean;
  /** When the last cycle started */
  lastCycleAt: number;
  /** When the next cycle is scheduled */
  nextCycleAt: number;
  /** Consecutive errors (pause after too many) */
  errorCount: number;
  /** Maximum errors before pausing */
  maxErrors: number;
  /** Whether the agent is paused (too many errors or dormant) */
  paused: boolean;
}

export interface SchedulerConfig {
  /** Max agents running simultaneously (default 5) */
  maxConcurrent: number;
  /** Default base interval for new agents (default 15 min) */
  defaultIntervalMs: number;
  /** Minimum interval for top-performing agents (default 2 min) */
  minIntervalMs: number;
  /** Maximum interval for low-performing agents (default 1 hour) */
  maxIntervalMs: number;
  /** Max consecutive errors before pausing an agent (default 5) */
  maxConsecutiveErrors: number;
  /** Tick rate — how often the scheduler checks for runnable agents (default 10s) */
  tickMs: number;
}

/* ═══════════════════════════  Scheduler  ═══════════════════════════ */

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrent: parseInt(process.env.SWARM_MAX_CONCURRENT ?? "5", 10),
  defaultIntervalMs: parseInt(process.env.SWARM_DEFAULT_INTERVAL_MS ?? "900000", 10),  // 15 min
  minIntervalMs: parseInt(process.env.SWARM_MIN_INTERVAL_MS ?? "120000", 10),           // 2 min
  maxIntervalMs: parseInt(process.env.SWARM_MAX_INTERVAL_MS ?? "3600000", 10),          // 1 hour
  maxConsecutiveErrors: parseInt(process.env.SWARM_MAX_ERRORS ?? "5", 10),
  tickMs: parseInt(process.env.SWARM_TICK_MS ?? "10000", 10),                           // 10s
};

export class AgentScheduler {
  private agents = new Map<string, ScheduledAgent>();
  private config: SchedulerConfig;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private activeCount = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Register an agent with the scheduler */
  register(agent: Agent, options?: { priority?: number; intervalMs?: number }): void {
    if (this.agents.has(agent.id)) return;

    const baseInterval = options?.intervalMs ?? this.config.defaultIntervalMs;
    const now = Date.now();

    this.agents.set(agent.id, {
      agent,
      baseIntervalMs: baseInterval,
      effectiveIntervalMs: baseInterval,
      priority: options?.priority ?? 50,
      running: false,
      lastCycleAt: 0,
      // Stagger initial execution: spread across the first interval period
      nextCycleAt: now + Math.random() * baseInterval,
      errorCount: 0,
      maxErrors: this.config.maxConsecutiveErrors,
      paused: false,
    });
  }

  /** Start the scheduler tick loop */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log(`[Scheduler] Starting with ${this.agents.size} agents, max ${this.config.maxConcurrent} concurrent`);

    // Start all agents (their internal state initializes)
    for (const entry of this.agents.values()) {
      try {
        entry.agent.start();
      } catch (err) {
        console.error(`[Scheduler] Failed to start ${entry.agent.id}:`, err);
        entry.paused = true;
      }
    }

    this.tickInterval = setInterval(() => {
      void this.tick();
    }, this.config.tickMs);
  }

  /** Stop the scheduler */
  stop(): void {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    for (const entry of this.agents.values()) {
      try {
        entry.agent.stop();
      } catch (err) {
        console.error(`[Scheduler] Failed to stop ${entry.agent.id}:`, err);
      }
    }

    console.log("[Scheduler] Stopped");
  }

  /** Update an agent's effective interval based on reputation score (0-100) */
  updateReputation(agentId: string, reputationScore: number): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;

    // Map reputation to interval: high rep = faster scheduling
    // rep 100 → minInterval, rep 0 → maxInterval
    const t = Math.max(0, Math.min(1, reputationScore / 100));
    entry.effectiveIntervalMs = Math.round(
      this.config.maxIntervalMs + t * (this.config.minIntervalMs - this.config.maxIntervalMs),
    );

    // High reputation also gets higher priority
    entry.priority = Math.round(reputationScore);
  }

  /** Pause/unpause an agent */
  setPaused(agentId: string, paused: boolean): void {
    const entry = this.agents.get(agentId);
    if (!entry) return;
    entry.paused = paused;
    if (!paused) entry.errorCount = 0;
  }

  /** Get scheduler state snapshot */
  snapshot(): {
    running: boolean;
    activeCount: number;
    totalAgents: number;
    agents: Array<{
      id: string;
      status: string;
      priority: number;
      effectiveIntervalMs: number;
      lastCycleAt: number;
      nextCycleAt: number;
      errorCount: number;
      paused: boolean;
      running: boolean;
    }>;
  } {
    return {
      running: this.running,
      activeCount: this.activeCount,
      totalAgents: this.agents.size,
      agents: Array.from(this.agents.values()).map((e) => ({
        id: e.agent.id,
        status: e.agent.status(),
        priority: e.priority,
        effectiveIntervalMs: e.effectiveIntervalMs,
        lastCycleAt: e.lastCycleAt,
        nextCycleAt: e.nextCycleAt,
        errorCount: e.errorCount,
        paused: e.paused,
        running: e.running,
      })),
    };
  }

  /** Internal tick — runs eligible agents up to concurrency limit */
  private async tick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();

    // Find eligible agents: not running, not paused, past their next cycle time
    const eligible = Array.from(this.agents.values())
      .filter((e) => !e.running && !e.paused && now >= e.nextCycleAt)
      .sort((a, b) => b.priority - a.priority); // highest priority first

    const slotsAvailable = this.config.maxConcurrent - this.activeCount;
    const toRun = eligible.slice(0, slotsAvailable);

    for (const entry of toRun) {
      this.runAgent(entry);
    }
  }

  /** Execute a single agent's cycle */
  private runAgent(entry: ScheduledAgent): void {
    entry.running = true;
    entry.lastCycleAt = Date.now();
    this.activeCount++;

    // The agent must implement a `runCycle` method if it's an EmergentAgent.
    // We check via duck typing since the base Agent interface doesn't include it.
    const agent = entry.agent as Agent & { runCycle?: () => Promise<void> };

    const cyclePromise = agent.runCycle
      ? agent.runCycle()
      : Promise.resolve(); // agents without runCycle just get start/stop lifecycle

    cyclePromise
      .then(() => {
        entry.errorCount = 0;
      })
      .catch((err: unknown) => {
        entry.errorCount++;
        console.error(
          `[Scheduler] ${entry.agent.id} cycle error (${entry.errorCount}/${entry.maxErrors}):`,
          err instanceof Error ? err.message : err,
        );

        if (entry.errorCount >= entry.maxErrors) {
          entry.paused = true;
          console.warn(`[Scheduler] ${entry.agent.id} paused after ${entry.errorCount} consecutive errors`);
        }
      })
      .finally(() => {
        entry.running = false;
        this.activeCount--;
        entry.nextCycleAt = Date.now() + entry.effectiveIntervalMs;
      });
  }
}

/** Singleton scheduler for the 67-agent swarm */
export const agentScheduler = new AgentScheduler();
