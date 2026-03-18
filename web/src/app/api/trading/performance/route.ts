import { NextResponse } from "next/server";
import { getTraderConfig } from "@/lib/trading/config";
import { PositionStore } from "@/lib/trading/position-store";
import { positionsToJournal, computePerformanceMetrics } from "@/lib/trading/trade-journal";
import { fetchHyperliquidAccountValueUsd, resolveHyperliquidAccountAddress } from "@/lib/trading/hyperliquid";
import { createTraderClients } from "@/lib/trading/clients";

export async function GET() {
  try {
    const config = getTraderConfig();
    const store = new PositionStore(config.positionStorePath);
    await store.load();

    const journal = positionsToJournal(store.getAll());
    const metrics = computePerformanceMetrics(journal);

    // Fetch live account value
    const clients = createTraderClients(config);
    const accountAddress = resolveHyperliquidAccountAddress(config, clients.address);
    let accountValueUsd: number | null = null;
    try {
      accountValueUsd = await fetchHyperliquidAccountValueUsd(config, accountAddress);
    } catch { /* non-fatal */ }

    const openPositions = store.getOpen();

    return NextResponse.json(
      {
        timestamp: Date.now(),
        accountValueUsd,
        openPositionCount: openPositions.length,
        watchMarkets: config.hyperliquid.watchMarkets,
        metrics,
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute performance" },
      { status: 500 },
    );
  }
}
