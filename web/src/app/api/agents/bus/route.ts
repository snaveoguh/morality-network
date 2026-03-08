// ─── GET /api/agents/bus — Debug message log ────────────────────────────────

import { NextResponse } from "next/server";
import { messageBus } from "@/lib/agents/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") || "50"), 1),
    200
  );
  const topic = searchParams.get("topic") || undefined;

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
