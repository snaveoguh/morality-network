import "server-only";

import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getOperatorAuthState } from "@/lib/operator-auth";
import { getSession } from "@/lib/session";
import {
  type TerminalSubscriptionStatus,
  getTerminalSubscriptionStatus,
} from "@/lib/terminal-subscription";

const DEFAULT_FREE_MONTHLY_MESSAGES = 30;

export interface TerminalFreeAccessSnapshot {
  monthKey: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface TerminalAccessState {
  operator: boolean;
  unlocked: boolean;
  sessionAddress: Address | null;
  requiredMoBalance: string;
  freeAccess: TerminalFreeAccessSnapshot;
  subscription: TerminalSubscriptionStatus | null;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getFreeMonthlyMessages(): number {
  const raw = process.env.TERMINAL_FREE_MONTHLY_MESSAGES?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_FREE_MONTHLY_MESSAGES;
  }
  return Math.floor(parsed);
}

export async function getTerminalFreeAccessSnapshot(): Promise<TerminalFreeAccessSnapshot> {
  const session = await getSession();
  const monthKey = currentMonthKey();
  const limit = getFreeMonthlyMessages();
  const used =
    session.terminalUsageMonthKey === monthKey
      ? Math.max(0, Math.floor(session.terminalUsageCount ?? 0))
      : 0;

  return {
    monthKey,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

export async function requireTerminalAccess(
  request: Request,
  options?: { consume?: boolean },
): Promise<NextResponse | TerminalAccessState> {
  const operatorAuth = await getOperatorAuthState(request);
  const session = await getSession();
  const monthKey = currentMonthKey();
  const freeLimit = getFreeMonthlyMessages();
  const existingUsed =
    session.terminalUsageMonthKey === monthKey
      ? Math.max(0, Math.floor(session.terminalUsageCount ?? 0))
      : 0;

  const sessionAddress =
    typeof session.address === "string" &&
    session.address.trim().length > 0 &&
    isAddress(session.address)
      ? (session.address as Address)
      : null;

  let subscription: TerminalSubscriptionStatus | null = null;
  let requiredMoBalance =
    process.env.NEXT_PUBLIC_TERMINAL_FULL_ACCESS_MIN_MO?.trim() ||
    process.env.TERMINAL_FULL_ACCESS_MIN_MO?.trim() ||
    "100000";

  if (sessionAddress) {
    try {
      subscription = await getTerminalSubscriptionStatus(sessionAddress);
      requiredMoBalance = subscription.requiredMoBalance ?? requiredMoBalance;
    } catch {
      subscription = null;
    }
  }

  if (operatorAuth.authorized || subscription?.account?.unlocked) {
    return {
      operator: operatorAuth.authorized,
      unlocked: true,
      sessionAddress,
      requiredMoBalance,
      freeAccess: {
        monthKey,
        limit: freeLimit,
        used: existingUsed,
        remaining: Math.max(0, freeLimit - existingUsed),
      },
      subscription,
    };
  }

  if (existingUsed >= freeLimit) {
    return NextResponse.json(
      {
        error: `Free monthly usage reached. Hold ${requiredMoBalance} MO in the connected wallet for full terminal access.`,
        requiredMoBalance,
        authenticated: Boolean(sessionAddress),
        address: sessionAddress,
        freeAccess: {
          monthKey,
          limit: freeLimit,
          used: existingUsed,
          remaining: 0,
        },
      },
      { status: 403 },
    );
  }

  const used = options?.consume === false ? existingUsed : existingUsed + 1;
  if (options?.consume !== false) {
    session.terminalUsageMonthKey = monthKey;
    session.terminalUsageCount = used;
    await session.save();
  }

  return {
    operator: false,
    unlocked: false,
    sessionAddress,
    requiredMoBalance,
    freeAccess: {
      monthKey,
      limit: freeLimit,
      used,
      remaining: Math.max(0, freeLimit - used),
    },
    subscription,
  };
}
