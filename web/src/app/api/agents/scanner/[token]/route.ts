// ─── GET /api/agents/scanner/:address — Individual token lookup ─────────────
//
// Looks up a token by pool address or token address.

import { NextResponse } from "next/server";
import { reportWarn } from "@/lib/report-error";
import { agentRegistry } from "@/lib/agents/core";
import { launchStore, scannerAgent } from "@/lib/agents/scanner";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";

// Ensure scanner is registered + initialized
import "@/lib/agents/scanner";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const BACKEND_TIMEOUT_MS = 10_000;

async function triggerBackendScannerSync(baseUrl: string): Promise<boolean> {
  try {
    const syncUrl = new URL("/api/v1/scanner/sync", `${baseUrl}/`);
    syncUrl.searchParams.set("limit", "25");
    const workerSecret = process.env.INDEXER_WORKER_SECRET?.trim();
    const response = await fetch(syncUrl.toString(), {
      method: "PUT",
      headers: workerSecret ? { authorization: `Bearer ${workerSecret}` } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    return response.ok;
  } catch (e) {
    reportWarn("api:scanner-token:auth", e);
    return false;
  }
}

async function fetchBackendLaunch(baseUrl: string, address: string): Promise<{
  status: number;
  launch: unknown | null;
}> {
  const url = new URL(`/api/v1/scanner/launches/${address}`, `${baseUrl}/`);
  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { status: response.status, launch: null };
  }

  const payload = (await response.json()) as { launch?: unknown };
  return {
    status: response.status,
    launch: payload.launch ?? null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const address = token.toLowerCase();

    if (!/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const scannerBackendUrl = getIndexerBackendUrl();
    if (scannerBackendUrl) {
      const baseUrl = scannerBackendUrl.replace(/\/$/, "");
      let lookup = await fetchBackendLaunch(baseUrl, address);

      if (!lookup.launch && lookup.status === 404) {
        await triggerBackendScannerSync(baseUrl);
        lookup = await fetchBackendLaunch(baseUrl, address);
      }

      if (lookup.launch) {
        return NextResponse.json(
          {
            launch: lookup.launch,
            timestamp: Date.now(),
            backend: "indexer",
          },
          {
            headers: {
              "cache-control": "no-store, max-age=0",
            },
          }
        );
      }

      if (lookup.status === 404) {
        return NextResponse.json(
          { error: "Token not found in persisted scanner history" },
          { status: 404 }
        );
      }

      if (isWorkerAgentRuntime()) {
        return NextResponse.json(
          { error: "persisted scanner state unavailable from indexer backend" },
          { status: 503 }
        );
      }
    }

    if (isWorkerAgentRuntime()) {
      return NextResponse.json(
        { error: "AGENT_RUNTIME_MODE=worker requires INDEXER_BACKEND_URL-backed scanner state" },
        { status: 503 }
      );
    }

    agentRegistry.ensureInitialized();
    void scannerAgent.pollNow({ reason: "api:scanner-token" });

    // Try pool address first (that's the store key)
    let launch = launchStore.get(address);

    // If not found, search by token address
    if (!launch) {
      const all = launchStore.getAll();
      launch = all.find((l) => l.tokenAddress === address) ?? undefined;
    }

    if (!launch) {
      return NextResponse.json(
        { error: "Token not found in scanner history" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        launch,
        timestamp: Date.now(),
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("[API /agents/scanner/:token] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch token data" },
      { status: 500 }
    );
  }
}
