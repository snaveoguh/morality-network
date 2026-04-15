import { NextResponse } from "next/server";
import { getLatestDeliberation } from "@/lib/trading/deliberation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "BTC,ETH,SOL")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const record = await getLatestDeliberation(symbol);
      return record ?? null;
    }),
  );

  return NextResponse.json({
    data: results.filter(Boolean),
    meta: { queriedSymbols: symbols, generatedAt: Date.now() },
  });
}
