import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getTerminalSubscriptionStatus } from "@/lib/terminal-subscription";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawAddress = searchParams.get("address");
    const forceRefresh = (() => {
      const raw = searchParams.get("refresh");
      if (!raw) return false;
      const normalized = raw.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes";
    })();
    const address =
      rawAddress && isAddress(rawAddress) ? (rawAddress as Address) : undefined;

    const status = await getTerminalSubscriptionStatus(address, { forceRefresh });
    return NextResponse.json(status, {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "failed to fetch subscription status",
      },
      { status: 500 }
    );
  }
}
