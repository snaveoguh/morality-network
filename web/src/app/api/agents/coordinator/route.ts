import { NextResponse } from "next/server";
import { reportWarn } from "@/lib/report-error";
import { agentRegistry, messageBus } from "@/lib/agents/core";
import { agentFactory } from "@/lib/agents/factory";
import { coordinatorAgent } from "@/lib/agents/coordinator";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import {
  fetchPersistedAgentEvents,
  fetchPersistedSwarmState,
} from "@/lib/server/runtime-backend";

import "@/lib/agents/scanner";
import "@/lib/agents/swarm";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    if (isWorkerAgentRuntime()) {
      const backendUrl = getIndexerBackendUrl();
      if (!backendUrl) {
        return NextResponse.json(
          { error: "AGENT_RUNTIME_MODE=worker requires INDEXER_BACKEND_URL" },
          { status: 503 },
        );
      }

      let lastActivityAt: number | null = null;
      let recent: Awaited<ReturnType<typeof fetchPersistedAgentEvents>>["messages"] = [];
      try {
        const swarmState = await fetchPersistedSwarmState();
        lastActivityAt = swarmState.updatedAt;
      } catch (e) {
        reportWarn("api:coordinator:swarm-state", e);
        lastActivityAt = null;
      }

      try {
        const recentPayload = await fetchPersistedAgentEvents({
          limit: 15,
          topic: [
            "score-request",
            "score-result",
            "trade-candidate",
            "agent-spawned",
            "topic-burst",
            "emerging-event",
            "contradictions-detected",
            "research-escalation",
          ],
        });
        recent = recentPayload.messages;
        if (recent[0]?.timestamp) {
          lastActivityAt = Math.max(lastActivityAt ?? 0, recent[0].timestamp);
        }
      } catch (e) {
        reportWarn("api:coordinator:events", e);
        recent = [];
      }

      const stats = {
        messageCount: recent.length,
        tradeCandidatesPublished: recent.filter((message) => message.topic === "trade-candidate").length,
        emergingEventsSeen: recent.filter((message) => message.topic === "emerging-event").length,
        contradictionsSeen: recent.filter((message) => message.topic === "contradictions-detected").length,
      };

      return NextResponse.json(
        {
          agent: {
            id: "coordinator",
            name: "Coordinator",
            description: "Coordinator runtime is delegated to the always-on worker tier.",
            status: "running",
            startedAt: null,
            lastActivityAt,
            stats,
            errors: [],
            remote: true,
            source: backendUrl,
          },
          factory: {
            spawnedCount: 0,
            maxAgents: 0,
            ids: [],
          },
          recent,
          backend: "worker",
          timestamp: Date.now(),
        },
        {
          headers: {
            "cache-control": "no-store, max-age=0",
          },
        }
      );
    }

    agentRegistry.ensureInitialized();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "15"), 1), 50);
    const recentTopics = new Set([
      "score-request",
      "score-result",
      "trade-candidate",
      "agent-spawned",
      "topic-burst",
      "emerging-event",
      "contradictions-detected",
    ]);

    const recent = messageBus
      .recentMessages(200)
      .filter((message) => recentTopics.has(message.topic))
      .slice(-limit);

    return NextResponse.json(
      {
        agent: coordinatorAgent.snapshot(),
        factory: agentFactory.snapshot(),
        recent,
        timestamp: Date.now(),
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "failed to load coordinator status",
      },
      { status: 500 }
    );
  }
}
