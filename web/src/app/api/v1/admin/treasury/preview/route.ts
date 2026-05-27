// GET /api/v1/admin/treasury/preview
//
// Single read-only snapshot for the operator before moving funds:
//   - HL balance (perp + spot USDC, totals)
//   - Across fee quote for the requested USDC amount (Arb → Base)
//   - Each agent SCW's current Base ETH+USDC balance
//
// Query: ?amountUsd=100 (default 100) — used for the Across quote
// Auth: Bearer TREASURY_ADMIN_TOKEN

import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { requireAdmin } from "@/lib/treasury/admin-auth";
import { getHlBalance, HL_WITHDRAW_FEE_USD } from "@/lib/treasury/hl";
import { BASE_USDC, getAcrossQuote } from "@/lib/treasury/across";
import { AGENT_IDS } from "@/lib/wallets/agent-ids";
import { getAgentAddress } from "@/lib/wallets/factory";
import { smartWalletsEnabled } from "@/lib/wallets/config";
import { basePublicClient } from "@/lib/wallets/clients";

const ERC20_BAL_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const amountUsd = Number(url.searchParams.get("amountUsd") ?? "100");

  const result: Record<string, unknown> = {};

  // HL balance
  try {
    result.hl = await getHlBalance();
    (result.hl as { withdrawFeeUsd?: number }).withdrawFeeUsd = HL_WITHDRAW_FEE_USD;
  } catch (err) {
    result.hl = { error: (err as Error).message };
  }

  // Across quote (only if amountUsd is sensible)
  if (Number.isFinite(amountUsd) && amountUsd > 0) {
    try {
      const amountRaw = BigInt(Math.floor(amountUsd * 1_000_000));
      const quote = await getAcrossQuote({ amountUsdcRaw: amountRaw });
      result.acrossQuote = {
        amountUsd,
        inputAmountRaw: quote.inputAmount.toString(),
        outputAmountRaw: quote.outputAmount.toString(),
        outputAmountUsd: Number(quote.outputAmount) / 1_000_000,
        totalRelayFeeUsd: quote.totalRelayFeeUsd,
        quoteTimestamp: quote.quoteTimestamp,
        fillDeadline: quote.fillDeadline,
      };
    } catch (err) {
      result.acrossQuote = { error: (err as Error).message };
    }
  }

  // Agent SCW balances
  if (smartWalletsEnabled()) {
    const client = basePublicClient();
    const agents: Array<Record<string, unknown>> = [];
    for (const id of AGENT_IDS) {
      try {
        const address = await getAgentAddress(id);
        const [ethRaw, usdcRaw] = await Promise.all([
          client.getBalance({ address }),
          client.readContract({
            address: BASE_USDC,
            abi: ERC20_BAL_ABI,
            functionName: "balanceOf",
            args: [address],
          }) as Promise<bigint>,
        ]);
        agents.push({
          agentId: id,
          address,
          ethWei: ethRaw.toString(),
          ethFormatted: formatUnits(ethRaw, 18),
          usdcRaw: usdcRaw.toString(),
          usdcFormatted: formatUnits(usdcRaw, 6),
        });
      } catch (err) {
        agents.push({ agentId: id, error: (err as Error).message });
      }
    }
    result.agentBalances = agents;
  } else {
    result.agentBalances = { error: "smart wallets disabled" };
  }

  return NextResponse.json(result);
}
