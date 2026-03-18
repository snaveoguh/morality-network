import { NextResponse } from "next/server";
import { getTraderConfig } from "@/lib/trading/config";
import {
  getHyperliquidClients,
  resolveHyperliquidAccountAddress,
  fetchHyperliquidAccountValueUsd,
} from "@/lib/trading/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/trading/transfer-to-perp
 * Transfers all USDC from HL spot → perp account.
 */
export async function POST() {
  try {
    const config = getTraderConfig();
    if (config.executionVenue !== "hyperliquid-perp") {
      return NextResponse.json({ error: "Not on hyperliquid-perp venue" }, { status: 400 });
    }

    const walletAddress = privateKeyToAccount(config.privateKey).address;
    const accountAddress = resolveHyperliquidAccountAddress(config, walletAddress);
    const clients = getHyperliquidClients(config);

    // Get spot balances via info client
    const spotState = await clients.infoClient.spotClearinghouseState({ user: accountAddress });
    const usdcBalance = spotState?.balances?.find(
      (b: { coin: string; total: string }) => b.coin === "USDC"
    );
    const spotAmount = usdcBalance ? parseFloat(usdcBalance.total) : 0;

    if (spotAmount <= 0) {
      return NextResponse.json({ message: "No USDC in spot", spotBalance: 0 });
    }

    // Format to 6 decimal places for HL API
    const amount = Math.floor(spotAmount * 1e6) / 1e6;
    const formatted = amount.toFixed(6);

    console.log(`[transfer] Moving ${formatted} USDC from spot → perp for ${accountAddress}`);

    await clients.exchangeClient.usdClassTransfer({
      amount: formatted,
      toPerp: true,
    });

    return NextResponse.json({
      success: true,
      transferred: amount,
      from: "spot",
      to: "perp",
      account: accountAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[transfer] Failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
