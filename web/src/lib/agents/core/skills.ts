// ─── Agent Core — Skill Library ─────────────────────────────────────────────
//
// Composable capabilities for the emergent agent swarm. Skills wrap existing
// code modules so any agent can discover, learn, and execute them. Proficiency
// is tracked per agent and decays over time to reward consistent practice.

// ─── Types ──────────────────────────────────────────────────────────────────

/** Skill category for discovery and filtering */
export type SkillCategory = "research" | "trading" | "creative" | "infra";

/** A composable capability that any agent can acquire and execute */
export interface Skill {
  /** Unique identifier (kebab-case, e.g. "fetch-rss") */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Short description of what this skill does */
  readonly description: string;
  /** Broad category for discovery */
  readonly category: SkillCategory;
  /** Module path this skill wraps (for documentation / dynamic import) */
  readonly modulePath: string;
  /** Execute the skill with arbitrary params */
  execute(params: Record<string, unknown>): Promise<SkillExecutionResult>;
}

/** Tracks an agent's proficiency with a specific skill */
export interface SkillProficiency {
  /** The skill id */
  skillId: string;
  /** The agent id */
  agentId: string;
  /** Total execution attempts */
  attempts: number;
  /** Total successful executions */
  successes: number;
  /** Computed proficiency score 0-1 (with time decay) */
  proficiency: number;
  /** Timestamp of last execution (epoch ms) */
  lastUsedAt: number;
}

/** Result returned by every skill execution */
export interface SkillExecutionResult {
  success: boolean;
  /** Arbitrary output data on success */
  data?: unknown;
  /** Error message on failure */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Proficiency half-life in milliseconds (7 days).
 * After 7 days of inactivity a skill's proficiency decays by 50%.
 */
const PROFICIENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1_000;

// ─── SkillLibrary ───────────────────────────────────────────────────────────

class SkillLibrary {
  /** All registered skills keyed by id */
  private skills = new Map<string, Skill>();

  /**
   * Proficiency records keyed by `${agentId}::${skillId}`.
   * Stored in memory — a persistent backend can be wired later.
   */
  private proficiencies = new Map<string, SkillProficiency>();

  // ─── Registration ───────────────────────────────────────────────────────

  /** Register a new skill. Overwrites if the id already exists. */
  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /** Remove a skill by id. Returns true if it existed. */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /** Register all seed skills (called during swarm genesis) */
  registerSeedSkills(): void {
    registerSeedSkills();
  }

  /** Alias for list() — used by spawn-swarm */
  listSkills(): Skill[] {
    return this.list();
  }

  // ─── Discovery ──────────────────────────────────────────────────────────

  /** List all available skills */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /** Get a single skill by id, or undefined */
  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /** Search skills by category */
  searchByCategory(category: SkillCategory): Skill[] {
    return this.list().filter((s) => s.category === category);
  }

  /** Search skills whose name or description matches a substring (case-insensitive) */
  search(query: string): Skill[] {
    const q = query.toLowerCase();
    return this.list().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }

  // ─── Execution ──────────────────────────────────────────────────────────

  /**
   * Execute a skill on behalf of an agent. Tracks proficiency automatically.
   * Throws if the skill does not exist.
   */
  async execute(
    agentId: string,
    skillId: string,
    params: Record<string, unknown> = {},
  ): Promise<SkillExecutionResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, error: `Skill "${skillId}" not found` };
    }

    const start = Date.now();
    let result: SkillExecutionResult;

    try {
      result = await skill.execute(params);
    } catch (err) {
      result = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    result.durationMs = Date.now() - start;
    this.recordOutcome(agentId, skillId, result.success);
    return result;
  }

  // ─── Proficiency ────────────────────────────────────────────────────────

  /** Get an agent's proficiency for a specific skill */
  getProficiency(agentId: string, skillId: string): SkillProficiency {
    const key = `${agentId}::${skillId}`;
    const record = this.proficiencies.get(key);
    if (!record) {
      return {
        skillId,
        agentId,
        attempts: 0,
        successes: 0,
        proficiency: 0,
        lastUsedAt: 0,
      };
    }
    return { ...record, proficiency: this.computeProficiency(record) };
  }

  /** Get all proficiency records for an agent */
  getAgentProficiencies(agentId: string): SkillProficiency[] {
    const results: SkillProficiency[] = [];
    for (const record of this.proficiencies.values()) {
      if (record.agentId === agentId) {
        results.push({ ...record, proficiency: this.computeProficiency(record) });
      }
    }
    return results;
  }

  /** Get all agents that have learned a given skill */
  getSkillPractitioners(skillId: string): SkillProficiency[] {
    const results: SkillProficiency[] = [];
    for (const record of this.proficiencies.values()) {
      if (record.skillId === skillId) {
        results.push({ ...record, proficiency: this.computeProficiency(record) });
      }
    }
    return results;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /** Record a skill execution outcome and update proficiency */
  private recordOutcome(agentId: string, skillId: string, success: boolean): void {
    const key = `${agentId}::${skillId}`;
    const existing = this.proficiencies.get(key);
    const now = Date.now();

    if (existing) {
      existing.attempts += 1;
      if (success) existing.successes += 1;
      existing.lastUsedAt = now;
      existing.proficiency = this.computeProficiency(existing);
    } else {
      const record: SkillProficiency = {
        skillId,
        agentId,
        attempts: 1,
        successes: success ? 1 : 0,
        proficiency: success ? 1 : 0,
        lastUsedAt: now,
      };
      this.proficiencies.set(key, record);
    }
  }

  /**
   * Compute proficiency with exponential time decay.
   * Base = successes / max(1, attempts), then multiplied by a decay factor
   * that halves every PROFICIENCY_HALF_LIFE_MS since last use.
   */
  private computeProficiency(record: SkillProficiency): number {
    if (record.attempts === 0) return 0;

    const base = record.successes / Math.max(1, record.attempts);
    const elapsed = Date.now() - record.lastUsedAt;
    const decay = Math.pow(0.5, elapsed / PROFICIENCY_HALF_LIFE_MS);
    return Math.round(base * decay * 1_000) / 1_000; // 3 decimal places
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const skillLibrary = new SkillLibrary();

// ─── Seed Skills ────────────────────────────────────────────────────────────
//
// Seed skills are stubs that reference existing code modules. Agents discover
// these skills and practice them. The actual wiring to real modules happens
// lazily — skills that can't resolve their module return a graceful error,
// which the agent's learn() loop interprets as "skill not yet available".

function stubSkill(
  id: string,
  name: string,
  category: SkillCategory,
  description: string,
  modulePath: string,
): Skill {
  return {
    id,
    name,
    description,
    category,
    modulePath,
    async execute(params: Record<string, unknown>): Promise<SkillExecutionResult> {
      // Stub: skills are wired to real modules as agents specialize.
      // For now, return a "not yet wired" result that the agent's
      // learn loop can use to decide whether to keep practicing.
      return {
        success: false,
        error: `Skill "${id}" is registered but not yet wired to its module (${modulePath}). Practice mode.`,
        data: { params, stub: true },
      };
    },
  };
}

/** Register all seed skills. Called once during swarm genesis. */
export function registerSeedSkills(): void {
  const seeds: Skill[] = [
    // ── Research ──
    stubSkill("fetch-rss", "Fetch RSS Feeds", "research", "Fetches and parses RSS feeds from configured news sources", "@/lib/rss"),
    stubSkill("score-token", "Score Token", "research", "Scores a token using multi-signal analysis", "@/lib/agents/scanner"),
    stubSkill("cluster-news", "Cluster News", "research", "Clusters related news items via swarm analysis", "@/lib/agent-swarm"),
    stubSkill("watch-governance", "Watch Governance", "research", "Monitors onchain governance proposals", "@/lib/agents/governance"),
    stubSkill("track-whales", "Track Whales", "research", "Monitors large wallet flows for whale signals", "@/lib/trading/wallet-flow"),
    stubSkill("web-intelligence", "Web Intelligence", "research", "Gathers web intelligence signals", "@/lib/trading/web-intelligence"),

    // ── Trading ──
    stubSkill("analyze-candles", "Analyze Candles", "trading", "Runs technical analysis on OHLCV candle data", "@/lib/trading/technical"),
    stubSkill("detect-patterns", "Detect Patterns", "trading", "Detects chart patterns in price data via LLM", "@/lib/trading/pattern-detector"),
    stubSkill("composite-signal", "Composite Signal", "trading", "Computes composite trading signal from multiple sub-signals", "@/lib/trading/composite-signal"),
    stubSkill("execute-hl-trade", "Execute HL Trade", "trading", "Submits an order to Hyperliquid DEX", "@/lib/trading/hyperliquid"),
    stubSkill("kelly-size", "Kelly Criterion", "trading", "Computes optimal position size using Kelly criterion", "@/lib/trading/kelly"),
    stubSkill("manage-position", "Manage Position", "trading", "Manages open position exits (SL, TP, trailing)", "@/lib/trading/engine"),
    stubSkill("council-debate", "Council Debate", "trading", "Runs multi-analyst council debate for consensus signal", "@/lib/trading/council-signal"),

    // ── Creative ──
    stubSkill("write-content", "Write Content", "creative", "Generates editorial content using LLM", "@/lib/agents/newsroom"),

    // ── Infrastructure ──
    stubSkill("post-to-bus", "Post to Bus", "infra", "Publishes a message to the inter-agent message bus", "@/lib/agents/core/bus"),
    stubSkill("read-bus", "Read Bus", "infra", "Reads recent messages from the agent bus", "@/lib/agents/core/bus"),
    stubSkill("monitor-health", "Monitor Health", "infra", "Checks system health metrics", "@/lib/agents/core/registry"),
    stubSkill("moral-check", "Moral Gate Check", "infra", "Evaluates an action against SOUL.md moral compass", "@/lib/trading/moral-gate"),
  ];

  for (const skill of seeds) {
    skillLibrary.register(skill);
  }
}

