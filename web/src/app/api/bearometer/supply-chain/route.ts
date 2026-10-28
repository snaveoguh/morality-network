import { NextResponse } from "next/server";
import { getSupplyChainSnapshot } from "@/lib/bearometer/supply-chain";
import { SUPPLY_CHAIN_SOURCES } from "@/lib/bearometer/supply-chain-sources";

// Bearometer China supply-chain indicators. Signals and data, not advice.
// ?sources=1 lists the feeds instead (same shape as /api/feed/sources).
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("sources") === "1") {
    return NextResponse.json({ sources: SUPPLY_CHAIN_SOURCES });
  }

  const snapshot = await getSupplyChainSnapshot();
  return NextResponse.json(
    {
      ...snapshot,
      indicators: snapshot.indicators.map((indicator) => ({
        ...indicator,
        group: { ...indicator.group, patterns: undefined },
      })),
      disclaimer: "Signals and data only. Not financial advice or a recommendation to trade.",
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } },
  );
}
