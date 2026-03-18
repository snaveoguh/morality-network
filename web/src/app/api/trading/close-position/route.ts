import { NextRequest, NextResponse } from "next/server";
import { getTraderConfig } from "@/lib/trading/config";
import {
  getHyperliquidClients,
  resolveHyperliquidAccountAddress,
  fetchHyperliquidLivePositions,
  fetchHyperliquidMarketBySymbol,
  executeHyperliquidOrderLive,
} from "@/lib/trading/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/trading/close-position
 * Body: { symbol: "BTC" } — closes the open position for that symbol.
 */
export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();
    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const config = getTraderConfig();
    if (config.executionVenue !== "hyperliquid-perp") {
      return NextResponse.json({ error: "Not on hyperliquid-perp" }, { status: 400 });
    }

    const walletAddress = privateKeyToAccount(config.privateKey).address;
    const accountAddress = resolveHyperliquidAccountAddress(config, walletAddress);

    // Get live positions
    const positions = await fetchHyperliquidLivePositions(config, accountAddress);
    const pos = positions.find((p) => p.symbol === symbol.toUpperCase());

    if (!pos) {
      return NextResponse.json({ error: `No open position for ${symbol}` }, { status: 404 });
    }

    const market = await fetchHyperliquidMarketBySymbol(config, pos.symbol);
    if (!market) {
      return NextResponse.json({ error: `Market not found: ${pos.symbol}` }, { status: 404 });
    }

    // Close: if long → sell, if short → buy
    const closeSide = pos.isShort ? "buy" : "sell";
    // pos.size is a decimal string like "0.00015" — pass absolute value as-is
    const absSize = pos.size.startsWith("-") ? pos.size.slice(1) : pos.size;
    const sizeRaw = absSize.startsWith(".") ? `0${absSize}` : absSize;

    const result = await executeHyperliquidOrderLive({
      config,
      market,
      side: closeSide,
      leverage: pos.leverage ?? config.hyperliquid.defaultLeverage,
      slippageBps: config.risk.slippageBps,
      reduceOnly: true,
      sizeRaw,
    });

    return NextResponse.json({
      success: true,
      symbol: pos.symbol,
      side: closeSide,
      fillPrice: result.fillPriceUsd,
      size: result.sizeRaw,
      txHash: result.txHash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[close-position] Failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
