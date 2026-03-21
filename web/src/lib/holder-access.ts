import "server-only";

import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getOperatorAuthState } from "@/lib/operator-auth";
import {
  type TerminalSubscriptionStatus,
  getTerminalSubscriptionStatus,
} from "@/lib/terminal-subscription";

export interface MoHolderAccessState {
  operator: boolean;
  holder: boolean;
  fullAccess: boolean;
  sessionAddress: Address | null;
  requiredMoBalance: string;
  subscription: TerminalSubscriptionStatus | null;
}

function getRequiredMoBalanceFallback(): string {
  return (
    process.env.NEXT_PUBLIC_TERMINAL_FULL_ACCESS_MIN_MO?.trim() ||
    process.env.TERMINAL_FULL_ACCESS_MIN_MO?.trim() ||
    "100000"
  );
}

export async function getMoHolderAccessState(
  request: Request,
): Promise<MoHolderAccessState> {
  const operatorAuth = await getOperatorAuthState(request);
  const sessionAddress =
    operatorAuth.address && isAddress(operatorAuth.address)
      ? (operatorAuth.address as Address)
      : null;

  let subscription: TerminalSubscriptionStatus | null = null;
  let requiredMoBalance = getRequiredMoBalanceFallback();

  if (sessionAddress) {
    try {
      subscription = await getTerminalSubscriptionStatus(sessionAddress);
      requiredMoBalance = subscription.requiredMoBalance ?? requiredMoBalance;
    } catch {
      subscription = null;
    }
  }

  const holder = subscription?.account?.unlocked === true;

  return {
    operator: operatorAuth.authorized,
    holder,
    fullAccess: operatorAuth.authorized || holder,
    sessionAddress,
    requiredMoBalance,
    subscription,
  };
}

export async function requireMoHolderAccess(
  request: Request,
): Promise<MoHolderAccessState | NextResponse> {
  const access = await getMoHolderAccessState(request);
  if (access.fullAccess) {
    return access;
  }

  return NextResponse.json(
    {
      error: `Hold ${access.requiredMoBalance} MO in a verified wallet for full access.`,
      requiredMoBalance: access.requiredMoBalance,
      authenticated: Boolean(access.sessionAddress),
      address: access.sessionAddress,
    },
    { status: 403 },
  );
}

