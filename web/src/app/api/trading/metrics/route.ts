import { NextResponse } from "next/server";
import { getTraderPerformance, redactedConfigSummary } from "@/lib/trading/engine";
import { fetchVaultOverview } from "@/lib/vault";
import { isAddress, type Address } from "viem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountParam = searchParams.get("account");
    const account =
      accountParam && isAddress(accountParam)
        ? (accountParam as Address)
        : null;

    const [performance, vault] = await Promise.all([
      getTraderPerformance(),
      fetchVaultOverview({ limit: 50, account }),
    ]);

    return NextResponse.json(
      {
        performance,
        vault,
        config: redactedConfigSummary(),
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "metrics failed",
      },
      { status: 500 }
    );
  }
}
