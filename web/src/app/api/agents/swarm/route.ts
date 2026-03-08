// ─── GET /api/agents/swarm — Research Swarm output ──────────────────────────
//
// Now backed by the SwarmAgent (which polls every 5 min and caches output).
// Falls back to direct swarm call if agent hasn't polled yet.

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";
import { swarmAgent } from "@/lib/agents/swarm";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { runResearchSwarm } from "@/lib/agent-swarm";

// Ensure swarm agent is registered
import "@/lib/agents/swarm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  agentRegistry.ensureInitialized();

  const { searchParams } = new URL(request.url);
  const clusterLimit = Number(searchParams.get("clusters") || "20");

  const safeLimit = Number.isFinite(clusterLimit)
    ? Math.min(Math.max(clusterLimit, 1), 40)
    : 20;

  // Use agent's cached output if available
  let output = swarmAgent.getLastOutput();

  // Fallback: run directly if agent hasn't polled yet
  if (!output) {
    const items = await fetchAllFeeds(DEFAULT_FEEDS);
    output = runResearchSwarm(items, 30);
  }

  return NextResponse.json({
    generatedAt: output.generatedAt,
    scannedItems: output.scannedItems,
    clusters: output.clusters.slice(0, safeLimit),
    contradictionFlags: output.contradictionFlags,
    agent: swarmAgent.snapshot(),
  });
}
