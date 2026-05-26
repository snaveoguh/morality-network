// Canonical allowlist of agent IDs that may have Base Smart Wallets derived
// for them. Adding an ID here is the only place to introduce a new agent
// wallet — every other module reads from this list.
//
// Order is meaningful only insofar as it preserves backward compatibility for
// any external consumer of the registry endpoint; do not reorder existing
// entries.

export const AGENT_IDS = [
  // in-process agents (web/src/lib/agents/*)
  "scanner",
  "swarm",
  "coordinator",
  "trader",
  "scalper",
  "governance",
  "newsroom",
  "factory",
  // standalone agent services (agents/*)
  "pooter1",
  "polypooter",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}
