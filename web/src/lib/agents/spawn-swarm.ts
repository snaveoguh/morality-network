/**
 * spawn-swarm.ts — Genesis script for the 67-agent emergent swarm.
 *
 * Creates 67 blank-slate agents, each with:
 * - A unique ID (agent-01 through agent-67)
 * - A derived wallet (from HD seed)
 * - $10 starting capital
 * - Access to the shared skill library
 *
 * Agents discover their own roles through observe→reflect→act→learn cycles.
 * The scheduler manages their lifecycle in a single Node.js process.
 */

import { agentScheduler } from "./core/scheduler";
import { agentRegistry } from "./core/registry";
import { skillLibrary } from "./core/skills";
import { reputationTracker } from "./core/reputation";
import { createEmergentAgent } from "./core/genesis";

/* ═══════════════════════════  Config  ═══════════════════════════ */

const SWARM_SIZE = parseInt(process.env.SWARM_SIZE ?? "67", 10);
const INITIAL_CAPITAL_USD = parseFloat(process.env.SWARM_INITIAL_CAPITAL_USD ?? "10");
const SWARM_ENABLED = process.env.SWARM_ENABLED === "true";

/* ═══════════════════════════  State  ═══════════════════════════ */

let spawned = false;

/* ═══════════════════════════  Spawn  ═══════════════════════════ */

/**
 * Spawn the full swarm. Idempotent — only runs once.
 * Call this from the agent initialization path.
 */
export function spawnSwarm(): {
  spawned: boolean;
  agentCount: number;
  skillCount: number;
} {
  if (spawned) {
    return {
      spawned: true,
      agentCount: SWARM_SIZE,
      skillCount: skillLibrary.listSkills().length,
    };
  }

  if (!SWARM_ENABLED) {
    console.log("[Swarm] SWARM_ENABLED is not set — skipping agent genesis");
    return { spawned: false, agentCount: 0, skillCount: 0 };
  }

  console.log(`[Swarm] Spawning ${SWARM_SIZE} emergent agents...`);

  // 1. Ensure seed skills are registered
  skillLibrary.registerSeedSkills();
  console.log(`[Swarm] Skill library: ${skillLibrary.listSkills().length} seed skills available`);

  // 2. Create agents
  for (let i = 0; i < SWARM_SIZE; i++) {
    const agent = createEmergentAgent({
      id: `agent-${(i + 1).toString().padStart(2, "0")}`,
      index: i,
      initialCapitalUsd: INITIAL_CAPITAL_USD,
    });

    // Seed reputation entry (ensure() auto-creates on first record)
    reputationTracker.record(agent.id, { type: "action-complete" });

    // Register with scheduler (staggered intervals)
    agentScheduler.register(agent, {
      priority: 50, // all start equal
      intervalMs: undefined, // use default (15 min)
    });

    // Register with legacy agent registry for API compatibility
    agentRegistry.register(agent);
  }

  console.log(`[Swarm] ${SWARM_SIZE} agents created and registered`);

  // 3. Start the scheduler
  agentScheduler.start();

  spawned = true;

  console.log(
    `[Swarm] Genesis complete — ${SWARM_SIZE} agents scheduled, ` +
    `${skillLibrary.listSkills().length} skills available, ` +
    `$${INITIAL_CAPITAL_USD} initial capital each`,
  );

  return {
    spawned: true,
    agentCount: SWARM_SIZE,
    skillCount: skillLibrary.listSkills().length,
  };
}

/**
 * Get a snapshot of the swarm state (for API/dashboard).
 */
export function getSwarmSnapshot(): {
  enabled: boolean;
  spawned: boolean;
  config: {
    swarmSize: number;
    initialCapitalUsd: number;
  };
  scheduler: ReturnType<typeof agentScheduler.snapshot>;
  reputation: ReturnType<typeof reputationTracker.snapshot>;
  skills: ReturnType<typeof skillLibrary.listSkills>;
} {
  return {
    enabled: SWARM_ENABLED,
    spawned,
    config: {
      swarmSize: SWARM_SIZE,
      initialCapitalUsd: INITIAL_CAPITAL_USD,
    },
    scheduler: agentScheduler.snapshot(),
    reputation: reputationTracker.snapshot(),
    skills: skillLibrary.listSkills(),
  };
}

/**
 * Stop the swarm (for graceful shutdown).
 */
export function stopSwarm(): void {
  if (!spawned) return;
  agentScheduler.stop();
  console.log("[Swarm] Stopped");
}
