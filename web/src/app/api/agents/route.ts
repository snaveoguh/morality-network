// ─── GET /api/agents — List all agents + remote agents ──────────────────────

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";

// Force import of agent modules so they self-register
import "@/lib/agents/scanner";
import "@/lib/agents/swarm";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Ensure all agents are initialized (idempotent)
    agentRegistry.ensureInitialized();

    const localAgents = agentRegistry.listAll();

    // Optionally fetch remote agents from bridge
    let remoteAgents: unknown[] = [];
    const bridgeUrl = process.env.AGENT_BRIDGE_URL;
    if (bridgeUrl) {
      try {
        const res = await fetch(
          `${bridgeUrl.replace(/\/$/, "")}/api/agent/status`,
          {
            signal: AbortSignal.timeout(3_000),
            headers: { Accept: "application/json" },
          }
        );
        if (res.ok) {
          const data = await res.json();
          // noun.wtf returns agent status directly — wrap it
          remoteAgents = [
            {
              id: "nounirl",
              name: "NounIRL",
              description: "Autonomous Noun trait sniper and settler",
              status: data.status ?? "unknown",
              startedAt: null,
              lastActivityAt: null,
              stats: {
                currentBlock: data.currentBlock ?? 0,
                reservations: data.reservationCount ?? 0,
                settlements: data.settlementCount ?? 0,
              },
              errors: [],
              remote: true,
              source: bridgeUrl,
            },
          ];
        }
      } catch {
        // Remote unavailable — that's fine
      }
    }

    return NextResponse.json({
      agents: [...localAgents, ...remoteAgents],
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
