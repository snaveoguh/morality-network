// ─── GET /api/agents/scanner — Scanner state + recent launches ──────────────
//
// Query params:
//   ?limit=50       — max launches to return (default 50, max 200)
//   ?minScore=0     — filter by minimum score
//   ?dex=uniswap-v3 — filter by DEX
//   ?enriched=true  — only return enriched launches (with DexScreener data)

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";
import { scannerAgent, launchStore } from "@/lib/agents/scanner";
import type { TokenLaunch } from "@/lib/agents/scanner";

// Ensure scanner is registered + initialized
import "@/lib/agents/scanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const API_POLL_TIMEOUT_MS = 7_000;

export async function GET(request: Request) {
  try {
    // Ensure agents are running
    agentRegistry.ensureInitialized();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || "50"), 1),
      200
    );
    const minScore = Number(searchParams.get("minScore") || "0");
    const dexFilter = searchParams.get("dex") || undefined;
    const enrichedOnly = searchParams.get("enriched") === "true";
    const forceRefresh = searchParams.get("refresh") === "1";

    // On serverless, interval timers are not reliable; trigger bounded on-demand polling.
    const pollTriggered = await Promise.race([
      scannerAgent.pollNow({
        force: forceRefresh,
        reason: "api:scanner",
      }),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), API_POLL_TIMEOUT_MS)
      ),
    ]);

    // Get all launches, sorted by discovery time (newest first)
    let launches: TokenLaunch[] = launchStore.getRecent(limit * 2); // Over-fetch for filtering

    // Apply filters
    if (minScore > 0) {
      launches = launches.filter((l) => l.score >= minScore);
    }
    if (dexFilter) {
      launches = launches.filter((l) => l.dex === dexFilter);
    }
    if (enrichedOnly) {
      launches = launches.filter((l) => l.enriched);
    }

    // Trim to requested limit
    launches = launches.slice(0, limit);

    // Agent snapshot for metadata
    const snapshot = scannerAgent.snapshot();

    return NextResponse.json(
      {
        agent: {
          status: snapshot.status,
          stats: snapshot.stats,
          errors: snapshot.errors,
        },
        launches,
        count: launches.length,
        totalStored: launchStore.size(),
        pollTriggered,
        timestamp: Date.now(),
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("[API /agents/scanner] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch scanner data" },
      { status: 500 }
    );
  }
}
