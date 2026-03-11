// ─── GET /api/agents/scanner/:address — Individual token lookup ─────────────
//
// Looks up a token by pool address or token address.

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";
import { launchStore, scannerAgent } from "@/lib/agents/scanner";

// Ensure scanner is registered + initialized
import "@/lib/agents/scanner";
import "@/lib/agents/coordinator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const BACKEND_TIMEOUT_MS = 10_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    agentRegistry.ensureInitialized();
    void scannerAgent.pollNow({ reason: "api:scanner-token" });

    const { token } = await params;
    const address = token.toLowerCase();

    if (!/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const scannerBackendUrl = process.env.SCANNER_BACKEND_URL?.trim();
    if (scannerBackendUrl) {
      const baseUrl = scannerBackendUrl.replace(/\/$/, "");
      const url = new URL(`/api/v1/scanner/launches/${address}`, baseUrl);
      const backendRes = await fetch(url.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });

      if (backendRes.ok) {
        const payload = (await backendRes.json()) as { launch?: unknown };
        if (payload.launch) {
          return NextResponse.json(
            {
              launch: payload.launch,
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
      }
    }

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
