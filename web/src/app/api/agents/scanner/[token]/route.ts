// ─── GET /api/agents/scanner/:address — Individual token lookup ─────────────
//
// Looks up a token by pool address or token address.

import { NextResponse } from "next/server";
import { agentRegistry } from "@/lib/agents/core";
import { launchStore } from "@/lib/agents/scanner";

// Ensure scanner is registered + initialized
import "@/lib/agents/scanner";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    agentRegistry.ensureInitialized();

    const { token } = await params;
    const address = token.toLowerCase();

    if (!/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
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

    return NextResponse.json({
      launch,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("[API /agents/scanner/:token] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch token data" },
      { status: 500 }
    );
  }
}
