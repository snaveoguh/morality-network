import "server-only";

import { NextResponse } from "next/server";
import { type Address } from "viem";
import { getSession } from "@/lib/session";
import { getMoHolderAccessState } from "@/lib/holder-access";
import { type TerminalSubscriptionStatus } from "@/lib/terminal-subscription";

const DEFAULT_FREE_MONTHLY_MESSAGES = 0;

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
  const holderAccess = await getMoHolderAccessState(request);
  const session = await getSession();
  const monthKey = currentMonthKey();
  const freeLimit = getFreeMonthlyMessages();
  const existingUsed =
    session.terminalUsageMonthKey === monthKey
      ? Math.max(0, Math.floor(session.terminalUsageCount ?? 0))
      : 0;

  const sessionAddress = holderAccess.sessionAddress;
  const subscription: TerminalSubscriptionStatus | null = holderAccess.subscription;
  const requiredMoBalance = holderAccess.requiredMoBalance;

  if (holderAccess.fullAccess) {
    return {
      operator: holderAccess.operator,
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

  if (freeLimit <= 0 || existingUsed >= freeLimit) {
    return NextResponse.json(
      {
        error: `Hold ${requiredMoBalance} MO in a verified wallet for full terminal access.`,
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
