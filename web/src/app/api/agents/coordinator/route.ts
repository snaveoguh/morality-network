import { NextResponse } from "next/server";
import { agentRegistry, messageBus } from "@/lib/agents/core";
import { agentFactory } from "@/lib/agents/factory";
import { coordinatorAgent } from "@/lib/agents/coordinator";

import "@/lib/agents/scanner";
import "@/lib/agents/swarm";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
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
