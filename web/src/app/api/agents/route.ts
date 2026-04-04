// ─── GET /api/agents — List all agents + remote agents ──────────────────────

import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { reportWarn } from "@/lib/report-error";
import { agentRegistry, getAgentSoulSummary } from "@/lib/agents/core";
import { buildNounIrlAgentSnapshot } from "@/lib/agents/nounirl";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedSwarmState } from "@/lib/server/runtime-backend";

// Force import of agent modules so they self-register
import "@/lib/agents/scanner";
import "@/lib/agents/swarm";
import "@/lib/agents/coordinator";
import "@/lib/agents/trader";
import "@/lib/agents/scalper";
import "@/lib/agents/governance";
import { spawnSwarm } from "@/lib/agents/spawn-swarm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const workerMode = isWorkerAgentRuntime();
    const backendUrl = getIndexerBackendUrl();
    let localAgents: unknown[] = [];

    if (workerMode) {
      if (!backendUrl) {
        return NextResponse.json(
          { error: "AGENT_RUNTIME_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 },
        );
      }

      let swarmState:
        | Awaited<ReturnType<typeof fetchPersistedSwarmState>>
        | null = null;
      let scannerCount = 0;

      try {
        swarmState = await fetchPersistedSwarmState();
      } catch (e) {
        reportWarn("api:agents:swarm-state", e);
        swarmState = null;
      }

      try {
        const response = await fetch(
          new URL("/api/v1/scanner/launches?limit=1", `${backendUrl}/`).toString(),
          {
            cache: "no-store",
            signal: AbortSignal.timeout(3_000),
          },
        );
        if (response.ok) {
          const payload = (await response.json()) as {
            count?: number;
            totalStored?: number;
          };
          scannerCount = payload.totalStored ?? payload.count ?? 0;
        }
      } catch (e) {
        reportWarn("api:agents:scanner-count", e);
        scannerCount = 0;
      }

      localAgents = [
        {
          id: "launch-scanner",
          name: "Token Launch Scanner",
          description: "Running in the always-on worker and persisted via the indexer.",
          status: "running",
          startedAt: null,
          lastActivityAt: null,
          stats: {
            visibleLaunches: scannerCount,
          },
          errors: [],
          remote: true,
          source: backendUrl,
        },
        {
          id: "research-swarm",
          name: "Research Swarm",
          description: "Running in the always-on worker and persisted via the indexer.",
          status: swarmState ? "running" : "degraded",
          startedAt: null,
          lastActivityAt: swarmState?.updatedAt ?? null,
          stats: {
            clusters: swarmState?.clusters.length ?? 0,
            scannedItems: swarmState?.scannedItems ?? 0,
            contradictions: swarmState?.contradictionFlags.length ?? 0,
          },
          errors: swarmState ? [] : ["persisted swarm state unavailable"],
          remote: true,
          source: backendUrl,
        },
        {
          id: "coordinator",
          name: "Coordinator",
          description: "Launch coordination is expected to run in the always-on worker tier.",
          status: "running",
          startedAt: null,
          lastActivityAt: swarmState?.updatedAt ?? null,
          stats: {},
          errors: [],
          remote: true,
          source: backendUrl,
        },
        {
          id: "trader",
          name: "Trader",
          description: "Trading engine runs in the always-on worker tier.",
          status: "running",
          startedAt: null,
          lastActivityAt: null,
          stats: {},
          errors: [],
          remote: true,
          source: backendUrl,
        },
        {
          id: "scalper",
          name: "Scalper",
          description: "Real-time 1m candle scalper on Hyperliquid — WebSocket-driven momentum trades.",
          status: "running",
          startedAt: null,
          lastActivityAt: null,
          stats: {},
          errors: [],
          remote: true,
          source: backendUrl,
        },
      ];
    } else {
      // Ensure all agents are initialized (idempotent)
      agentRegistry.ensureInitialized();
      // Spawn the 67-agent emergent swarm (idempotent — only runs once)
      spawnSwarm();
      localAgents = agentRegistry.listAll();
    }

    // Optionally fetch remote agents from bridge
    let remoteAgents: unknown[] = [];
    const bridgeUrl = process.env.AGENT_BRIDGE_URL;
    const bridgeTopics = (process.env.AGENT_BRIDGE_TOPICS?.trim() ||
      "trade-candidate,research-escalation,emerging-event,contradictions-detected,trade-executed,trade-closed,trader-cycle-complete")
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    if (bridgeUrl) {
      const bridgeBaseUrl = bridgeUrl.replace(/\/$/, "");
      const [statusPayload, predictPayload, reservationsPayload] = await Promise.all([
        fetchBridgeJson(`${bridgeBaseUrl}/api/agent/status`),
        fetchBridgeJson(`${bridgeBaseUrl}/api/agent/predict`),
        fetchBridgeJson(`${bridgeBaseUrl}/api/agent/reservations`),
      ]);

      if (statusPayload || predictPayload || reservationsPayload) {
        remoteAgents = [
          buildNounIrlAgentSnapshot({
            bridgeTopics,
            bridgeUrl,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
            statusPayload,
            predictPayload,
            reservationsPayload,
          }),
        ];
      }
    }

    return NextResponse.json({
      agents: [...localAgents, ...remoteAgents],
      soul: getAgentSoulSummary(),
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[API /agents] Error:", err);
    return NextResponse.json(
      { error: "Failed to list agents" },
      { status: 500 }
    );
  }
}

async function fetchBridgeJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (e) {
    reportWarn("api:agents:snapshot", e);
    return null;
  }
}
