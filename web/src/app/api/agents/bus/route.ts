// ─── GET /api/agents/bus — Debug message log ────────────────────────────────

import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { messageBus } from "@/lib/agents/core";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { fetchPersistedAgentEvents } from "@/lib/server/runtime-backend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await verifyOperatorAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") || "50"), 1),
    200
  );
  const topic = searchParams.get("topic") || undefined;

  if (isWorkerAgentRuntime()) {
    try {
      const payload = await fetchPersistedAgentEvents({
        limit,
        topic,
      });
      return NextResponse.json({
        messages: payload.messages,
        count: payload.count,
        backend: "worker",
        source: getIndexerBackendUrl(),
        timestamp: Date.now(),
      });
    } catch (error) {
      return NextResponse.json(
        {
          messages: [],
          count: 0,
          backend: "worker",
          source: getIndexerBackendUrl(),
          error: error instanceof Error ? error.message : "failed to load persisted bus",
          timestamp: Date.now(),
        },
        { status: 503 },
      );
    }
  }

  let messages = messageBus.recentMessages(limit);

  // Filter by topic if specified
  if (topic) {
    messages = messages.filter((m) => m.topic === topic);
  }

  return NextResponse.json({
    messages,
    count: messages.length,
    timestamp: Date.now(),
  });
}
