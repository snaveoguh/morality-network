// ─── GET /api/agents/swarm — Research Swarm output ──────────────────────────
//
// Now backed by the SwarmAgent (which polls every 5 min and caches output).
// Falls back to direct swarm call if agent hasn't polled yet.

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";
import { swarmAgent } from "@/lib/agents/swarm";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { runResearchSwarm } from "@/lib/agent-swarm";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedSwarmState } from "@/lib/server/runtime-backend";

// Ensure swarm agent is registered
import "@/lib/agents/swarm";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await verifyOperatorAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const clusterLimit = Number(searchParams.get("clusters") || "20");
  const safeLimit = Number.isFinite(clusterLimit)
    ? Math.min(Math.max(clusterLimit, 1), 40)
    : 20;
  const backendUrl = getIndexerBackendUrl();

  if (backendUrl) {
    try {
      const output = await fetchPersistedSwarmState();
      return NextResponse.json({
        generatedAt: output.generatedAt,
        scannedItems: output.scannedItems,
        clusters: output.clusters.slice(0, safeLimit),
        contradictionFlags: output.contradictionFlags,
        backend: "indexer",
        agent: {
          id: "research-swarm",
          name: "Research Swarm",
          description:
            "Clusters RSS feeds into emerging events and contradiction flags from persisted worker snapshots.",
          status: "running",
          startedAt: null,
          lastActivityAt: output.updatedAt,
          stats: {
            clusters: output.clusters.length,
            scannedItems: output.scannedItems,
            contradictions: output.contradictionFlags.length,
          },
          errors: [],
          remote: true,
          source: backendUrl,
        },
      });
    } catch (error) {
      if (isWorkerAgentRuntime()) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "persisted swarm state unavailable",
          },
          { status: 503 },
        );
      }
    }
  }

  if (isWorkerAgentRuntime()) {
    return NextResponse.json(
      { error: "AGENT_RUNTIME_MODE=worker requires INDEXER_BACKEND_URL-backed swarm state" },
      { status: 503 },
    );
  }

  agentRegistry.ensureInitialized();

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
