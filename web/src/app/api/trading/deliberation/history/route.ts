import { NextResponse } from "next/server";
import { getDeliberationHistory } from "@/lib/trading/deliberation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTC").toUpperCase();
  const count = Math.min(30, Math.max(1, parseInt(searchParams.get("count") || "10", 10)));

  const records = await getDeliberationHistory(symbol, count);

  return NextResponse.json({
    data: records,
    meta: { symbol, count, generatedAt: Date.now() },
  });
}
