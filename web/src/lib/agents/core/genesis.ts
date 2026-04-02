// ─── Agent Core — Genesis ────────────────────────────────────────────────────
//
// Emergent agent system. Each agent starts as a blank slate and discovers its
// own specialization through an observe → reflect → act → learn loop.

import type { Agent, AgentSnapshot, AgentStatus, AgentMessage } from "./types";
import { messageBus } from "./bus";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Observation {
  type: "bus-message" | "market-state" | "agent-action" | "reputation-change";
  timestamp: number;
  data: unknown;
}

export interface Strategy {
  skillId: string;
  input: unknown;
  reasoning: string;
  expectedOutcome: string;
}

export interface ActionResult {
  success: boolean;
  data: unknown;
  costUsd: number;
  revenueUsd: number;
}

export interface AgentMemoryEntry {
  key: string;
  value: string;
  learnedAt: number;
  reinforcedCount: number;
}

export interface EmergentAgentConfig {
  id: string;
  index: number;
  initialCapitalUsd: number;
}

export interface SkillProficiency {
  skillId: string;
  proficiency: number; // 0.0 – 1.0
  attempts: number;
  successes: number;
  lastUsedAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_MEMORIES = 100;
const INITIAL_REPUTATION = 50;
const DEATH_REPUTATION_THRESHOLD = 10;
const PROFICIENCY_GAIN = 0.05;
const PROFICIENCY_LOSS = 0.02;
const PRACTICE_THRESHOLD = 0.1;

// ─── EmergentAgent ───────────────────────────────────────────────────────────

export class EmergentAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  private _status: AgentStatus = "idle";
  private _startedAt: number | null = null;
  private _errors: string[] = [];

  // Internal state
  private skills: Map<string, SkillProficiency> = new Map();
  private memories: AgentMemoryEntry[] = [];
  private reputation: number = INITIAL_REPUTATION;
  private capital: number;
  private alive: boolean = true;
  private cycleCount: number = 0;
  private lastCycleAt: number = 0;

  private cycleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: EmergentAgentConfig) {
    this.id = config.id;
    this.name = `agent-${config.index.toString().padStart(2, "0")}`;
    this.description = `Emergent agent #${config.index} — discovers its own specialization`;
    this.capital = config.initialCapitalUsd;
  }

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;
    this._status = "starting";
    this._startedAt = Date.now();
    this._status = "running";

    // Run the first cycle immediately, then every 60s
    void this.runCycle();
    this.cycleTimer = setInterval(() => {
      if (this.alive && this._status === "running") {
        void this.runCycle();
      }
    }, 60_000);
  }

  stop(): void {
    this._status = "stopping";
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this._status = "idle";
  }

  snapshot(): AgentSnapshot {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this._startedAt,
      lastActivityAt: this.lastCycleAt || null,
      stats: {
        reputation: this.reputation,
        capital: this.capital,
        cycleCount: this.cycleCount,
        skillCount: this.skills.size,
        memoryCount: this.memories.length,
        alive: this.alive ? 1 : 0,
      },
      errors: this._errors.slice(-10),
    };
  }

  // ─── Core Loop ───────────────────────────────────────────────────────────

  async runCycle(): Promise<void> {
    if (!this.alive) return;

    // Check death conditions
    if (this.reputation <= DEATH_REPUTATION_THRESHOLD || this.capital <= 0) {
      this.alive = false;
      this._status = "idle";
      return;
    }

    try {
      const observations = this.observe();
      const strategy = await this.reflect(observations);
      if (!strategy) {
        // LLM (or fallback) chose no action — valid outcome
        this.cycleCount++;
        this.lastCycleAt = Date.now();
        return;
      }
      const result = await this.act(strategy);
      this.learn(strategy, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._errors.push(`[cycle ${this.cycleCount}] ${msg}`);
      if (this._errors.length > 50) this._errors = this._errors.slice(-50);
    }

    this.cycleCount++;
    this.lastCycleAt = Date.now();
  }

  // ─── Observe ─────────────────────────────────────────────────────────────

  private observe(): Observation[] {
    const recentMessages = messageBus.recentMessages(20);
    const observations: Observation[] = [];

    for (const msg of recentMessages) {
      if (msg.topic === "agent-action") {
        observations.push({
          type: "agent-action",
          timestamp: msg.timestamp,
          data: msg.payload,
        });
      } else if (msg.topic === "market-state") {
        observations.push({
          type: "market-state",
          timestamp: msg.timestamp,
          data: msg.payload,
        });
      } else if (msg.topic === "reputation-change") {
        observations.push({
          type: "reputation-change",
          timestamp: msg.timestamp,
          data: msg.payload,
        });
      } else {
        observations.push({
          type: "bus-message",
          timestamp: msg.timestamp,
          data: { topic: msg.topic, from: msg.from, payload: msg.payload },
        });
      }
    }

    return observations;
  }

  // ─── Reflect ─────────────────────────────────────────────────────────────

  private async reflect(observations: Observation[]): Promise<Strategy | null> {
    const skillSummary = Array.from(this.skills.values())
      .map((s) => `${s.skillId}: proficiency=${s.proficiency.toFixed(2)}, attempts=${s.attempts}`)
      .join("\n");

    const recentMemories = this.memories
      .slice(-10)
      .map((m) => `${m.key}: ${m.value}`)
      .join("\n");

    const prompt = [
      `You are ${this.name} (id: ${this.id}), an emergent agent in a hyperstructure.`,
      `Your reputation is ${this.reputation}/100. Your capital is $${this.capital.toFixed(2)}.`,
      "",
      "Your current skills:",
      skillSummary || "(none yet — you are a blank slate)",
      "",
      "Recent memories:",
      recentMemories || "(no memories yet)",
      "",
      `Recent observations (${observations.length}):`,
      JSON.stringify(observations.slice(-10), null, 2),
      "",
      "Based on these observations, what skill should you execute?",
      "Consider: what is most needed by the hyperstructure right now?",
      "What would generate the most value?",
      "Remember: no action is also valid — respond with null if you should wait.",
      "",
      'Respond ONLY with JSON: { "skillId": string, "input": any, "reasoning": string, "expectedOutcome": string } or null',
    ].join("\n");

    try {
      const hubUrl = process.env.AGENT_HUB_URL;
      if (!hubUrl) throw new Error("AGENT_HUB_URL not set");

      const res = await fetch(`${hubUrl.replace(/\/$/, "")}/v1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "agent-reflect", prompt }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) throw new Error(`Hub returned ${res.status}`);

      const body = (await res.json()) as { text?: string; content?: string };
      const text = body.text ?? body.content ?? "";
      const parsed = JSON.parse(text);

      if (parsed === null) return null;

      return {
        skillId: String(parsed.skillId ?? ""),
        input: parsed.input ?? null,
        reasoning: String(parsed.reasoning ?? ""),
        expectedOutcome: String(parsed.expectedOutcome ?? ""),
      };
    } catch {
      // Fallback: pick highest-proficiency skill, or null if no skills
      return this.fallbackStrategy();
    }
  }

  private fallbackStrategy(): Strategy | null {
    if (this.skills.size === 0) return null;

    let best: SkillProficiency | null = null;
    for (const skill of this.skills.values()) {
      if (!best || skill.proficiency > best.proficiency) {
        best = skill;
      }
    }

    if (!best) return null;

    return {
      skillId: best.skillId,
      input: null,
      reasoning: "Fallback: LLM unavailable, using highest-proficiency skill",
      expectedOutcome: "Execute known skill to maintain activity",
    };
  }

  // ─── Act ─────────────────────────────────────────────────────────────────

  private async act(strategy: Strategy): Promise<ActionResult> {
    const proficiency = this.skills.get(strategy.skillId)?.proficiency ?? 0;
    const isPractice = proficiency < PRACTICE_THRESHOLD;

    // Publish intent to the bus
    const actionMessage: AgentMessage = {
      id: `${this.id}-action-${Date.now()}`,
      from: this.id,
      to: "*",
      topic: "agent-action",
      payload: {
        agentId: this.id,
        skillId: strategy.skillId,
        reasoning: strategy.reasoning,
        practice: isPractice,
      },
      timestamp: Date.now(),
    };

    await messageBus.publish(actionMessage);

    // Simulated execution — in a real system this would invoke the skill library.
    // For now, model a probabilistic outcome based on proficiency.
    const successChance = isPractice ? 0.3 : Math.min(0.5 + proficiency * 0.5, 0.95);
    const succeeded = Math.random() < successChance;
    const cost = isPractice ? 0 : 0.001; // minimal inference cost
    const revenue = succeeded && !isPractice ? 0.002 * proficiency : 0;

    return {
      success: succeeded,
      data: { skillId: strategy.skillId, practice: isPractice },
      costUsd: cost,
      revenueUsd: revenue,
    };
  }

  // ─── Learn ───────────────────────────────────────────────────────────────

  private learn(strategy: Strategy, result: ActionResult): void {
    // Update or create skill proficiency
    const existing = this.skills.get(strategy.skillId);
    if (existing) {
      existing.attempts++;
      existing.lastUsedAt = Date.now();
      if (result.success) {
        existing.successes++;
        existing.proficiency = Math.min(existing.proficiency + PROFICIENCY_GAIN, 1.0);
      } else {
        existing.proficiency = Math.max(existing.proficiency - PROFICIENCY_LOSS, 0.0);
      }
    } else {
      this.skills.set(strategy.skillId, {
        skillId: strategy.skillId,
        proficiency: result.success ? PROFICIENCY_GAIN : 0,
        attempts: 1,
        successes: result.success ? 1 : 0,
        lastUsedAt: Date.now(),
      });
    }

    // Store memory
    const memoryKey = `${strategy.skillId}:${result.success ? "success" : "failure"}`;
    const existingMemory = this.memories.find((m) => m.key === memoryKey);
    if (existingMemory) {
      existingMemory.reinforcedCount++;
      existingMemory.value = strategy.reasoning;
    } else {
      this.memories.push({
        key: memoryKey,
        value: strategy.reasoning,
        learnedAt: Date.now(),
        reinforcedCount: 1,
      });
    }

    // Cap memories at MAX_MEMORIES — evict least-reinforced
    if (this.memories.length > MAX_MEMORIES) {
      this.memories.sort((a, b) => b.reinforcedCount - a.reinforcedCount);
      this.memories = this.memories.slice(0, MAX_MEMORIES);
    }

    // Update capital
    this.capital += result.revenueUsd - result.costUsd;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createEmergentAgent(config: EmergentAgentConfig): EmergentAgent {
  return new EmergentAgent({
    id: config.id,
    index: config.index,
    initialCapitalUsd: config.initialCapitalUsd ?? 10,
  });
}
