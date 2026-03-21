import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getMoHolderAccessState } from "@/lib/holder-access";
import { getTerminalFreeAccessSnapshot } from "@/lib/terminal-access";
import { getTerminalSubscriptionStatus } from "@/lib/terminal-subscription";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const holderAccess = await getMoHolderAccessState(request);
    const { searchParams } = new URL(request.url);
    const rawAddress = searchParams.get("address");
    const forceRefresh = (() => {
      const raw = searchParams.get("refresh");
      if (!raw) return false;
      const normalized = raw.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes";
    })();
    const address =
      rawAddress && isAddress(rawAddress)
        ? (rawAddress as Address)
        : holderAccess.sessionAddress
          ? holderAccess.sessionAddress
          : undefined;

    const status = await getTerminalSubscriptionStatus(address, { forceRefresh });
    const freeAccess = await getTerminalFreeAccessSnapshot();
    const sessionMatchesAccount =
      Boolean(address) &&
      Boolean(holderAccess.sessionAddress) &&
      address?.toLowerCase() === holderAccess.sessionAddress?.toLowerCase();

    return NextResponse.json(
      {
        ...status,
        freeAccess,
        fullAccess: holderAccess.fullAccess,
        holderVerified: holderAccess.holder,
        operator: holderAccess.operator,
        session: {
          authenticated: Boolean(holderAccess.sessionAddress),
          address: holderAccess.sessionAddress,
          matchesAccount: sessionMatchesAccount,
        },
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
        error:
          error instanceof Error
            ? error.message
            : "failed to fetch subscription status",
      },
      { status: 500 }
    );
  }
}
