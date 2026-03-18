import { NextResponse } from "next/server";
import { getTraderConfig } from "@/lib/trading/config";
import { fetchTechnicalSignal } from "@/lib/trading/technical";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coin = (url.searchParams.get("coin") ?? "BTC").toUpperCase();
    const interval = (url.searchParams.get("interval") ?? "15m") as "1m" | "5m" | "15m" | "1h" | "4h";

    const config = getTraderConfig();
    const signal = await fetchTechnicalSignal(config, coin, { interval });

    return NextResponse.json(signal, {
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute indicators" },
      { status: 500 },
    );
  }
}
