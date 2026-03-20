// ─── GET /api/agents/scanner — Scanner state + recent launches ──────────────
//
// Query params:
//   ?limit=50       — max launches to return (default 50, max 200)
//   ?minScore=0     — filter by minimum score
//   ?dex=uniswap-v3 — filter by DEX
//   ?enriched=true  — only return enriched launches (with DexScreener data)

import { NextResponse } from "next/server";
import { reportWarn } from "@/lib/report-error";
import { agentRegistry } from "@/lib/agents/core";
import { scannerAgent, launchStore } from "@/lib/agents/scanner";
import type { TokenLaunch } from "@/lib/agents/scanner";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";

// Ensure scanner is registered + initialized
import "@/lib/agents/scanner";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const API_POLL_TIMEOUT_MS = 7_000;
const BACKEND_TIMEOUT_MS = 10_000;

interface PersistedScannerResponse {
  items?: unknown[];
  count?: number;
  totalStored?: number;
  meta?: { generatedAt?: number };
}

async function triggerBackendScannerSync(baseUrl: string, limit: number): Promise<boolean> {
  try {
    const syncUrl = new URL("/api/v1/scanner/sync", `${baseUrl}/`);
    syncUrl.searchParams.set("limit", String(Math.max(limit, 25)));
    const response = await fetch(syncUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    return response.ok;
  } catch (e) {
    reportWarn("api:scanner:auth", e);
    return false;
  }
}

async function fetchPersistedScannerLaunches(args: {
  baseUrl: string;
  limit: number;
  minScore: number;
  dexFilter?: string;
  enrichedOnly: boolean;
}): Promise<
  | {
      ok: true;
      launches: TokenLaunch[];
      totalStored: number;
    }
  | {
      ok: false;
      status: number;
    }
> {
  const launchesUrl = new URL("/api/v1/scanner/launches", `${args.baseUrl}/`);
  launchesUrl.searchParams.set("limit", String(args.limit));
  launchesUrl.searchParams.set("minScore", String(args.minScore));
  if (args.dexFilter) launchesUrl.searchParams.set("dex", args.dexFilter);

  const backendRes = await fetch(launchesUrl.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });

  if (!backendRes.ok) {
    return { ok: false, status: backendRes.status };
  }

  const payload = (await backendRes.json()) as PersistedScannerResponse;
  let launches = (Array.isArray(payload.items) ? payload.items : []) as TokenLaunch[];

  if (args.enrichedOnly) {
    launches = launches.filter((launch) => Boolean(launch.enriched));
  }

  return {
    ok: true,
    launches,
    totalStored:
      typeof payload.totalStored === "number"
        ? payload.totalStored
        : typeof payload.count === "number"
          ? payload.count
          : launches.length,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || "50"), 1),
      200
    );
    const minScore = Number(searchParams.get("minScore") || "0");
    const dexFilter = searchParams.get("dex") || undefined;
    const enrichedOnly = searchParams.get("enriched") === "true";
    const forceRefresh = searchParams.get("refresh") === "1";
    const scannerBackendUrl = getIndexerBackendUrl();

    if (scannerBackendUrl) {
      const baseUrl = scannerBackendUrl.replace(/\/$/, "");
      let syncTriggered = false;

      if (forceRefresh) {
        syncTriggered = await triggerBackendScannerSync(baseUrl, limit);
      }

      let persisted = await fetchPersistedScannerLaunches({
        baseUrl,
        limit,
        minScore,
        dexFilter,
        enrichedOnly,
      });

      if (persisted.ok && persisted.totalStored === 0 && !syncTriggered) {
        syncTriggered = await triggerBackendScannerSync(baseUrl, limit);
        persisted = await fetchPersistedScannerLaunches({
          baseUrl,
          limit,
          minScore,
          dexFilter,
          enrichedOnly,
        });
      }

      if (persisted.ok) {
        return NextResponse.json(
          {
            agent: {
              id: "launch-scanner",
              name: "Token Launch Scanner",
              description:
                "Reads persisted Base launch data from the indexer and auto-seeds it from DexScreener search if the backend is empty.",
              status: "running",
              remote: true,
              source: baseUrl,
              stats: {
                totalLaunches: persisted.totalStored,
                visibleLaunches: persisted.launches.length,
                launchesLastHour: 0,
                avgScore: 0,
                pollCount: 0,
                uptimeSeconds: 0,
              },
              errors: [],
            },
            launches: persisted.launches,
            count: persisted.launches.length,
            totalStored: persisted.totalStored,
            pollTriggered: syncTriggered,
            backend: "indexer",
            timestamp: Date.now(),
          },
          {
            headers: {
              "cache-control": "no-store, max-age=0",
            },
          }
        );
      }

      if (isWorkerAgentRuntime()) {
        return NextResponse.json(
          { error: "persisted scanner state unavailable from indexer backend" },
          { status: 503 },
        );
      }
    }

    if (isWorkerAgentRuntime()) {
      return NextResponse.json(
        { error: "AGENT_RUNTIME_MODE=worker requires INDEXER_BACKEND_URL-backed scanner state" },
        { status: 503 },
      );
    }

    // Ensure agents are running only when no durable backend is configured.
    agentRegistry.ensureInitialized();

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
