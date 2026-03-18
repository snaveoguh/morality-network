import { NextResponse } from "next/server";
import { getTraderConfig } from "@/lib/trading/config";
import { fetchCandles, type CandleInterval } from "@/lib/trading/hyperliquid";

const VALID_INTERVALS = new Set<CandleInterval>([
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M",
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coin = (url.searchParams.get("coin") ?? "BTC").toUpperCase();
    const interval = (url.searchParams.get("interval") ?? "15m") as CandleInterval;
    const count = Math.min(500, Math.max(10, parseInt(url.searchParams.get("count") ?? "200", 10)));

    if (!VALID_INTERVALS.has(interval)) {
      return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
    }

    const config = getTraderConfig();
    const candles = await fetchCandles(config, coin, interval, count);

    return NextResponse.json(
      {
        coin,
        interval,
        count: candles.length,
        candles: candles.map((c) => ({
          time: Math.floor(c.timestamp / 1000),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
      },
      {
        headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch candles" },
      { status: 500 },
    );
  }
}
