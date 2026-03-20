import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { getTraderConfig } from "@/lib/trading/config";
import { PositionStore } from "@/lib/trading/position-store";
import { positionsToJournal } from "@/lib/trading/trade-journal";

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol")?.toUpperCase() ?? undefined;
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10)));

    const config = getTraderConfig();
    const store = new PositionStore(config.positionStorePath);
    await store.load();

    let journal = positionsToJournal(store.getAll());

    if (symbol) {
      journal = journal.filter((t) => t.symbol === symbol);
    }

    // Most recent first
    journal.reverse();
    journal = journal.slice(0, limit);

    return NextResponse.json(
      { count: journal.length, trades: journal },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch journal" },
      { status: 500 },
    );
  }
}
