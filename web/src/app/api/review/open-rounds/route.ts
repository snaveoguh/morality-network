import { NextRequest, NextResponse } from "next/server";

import { openPendingRounds } from "@/lib/ledger/review-staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim();

/**
 * POST /api/review/open-rounds — put every resolution awaiting review into a
 * staked review round.
 *
 * Operator/cron only: this spends reviewers' attention and locks their stake,
 * so it must not be triggerable by a passing visitor.
 *
 * Resolutions that cannot legally settle yet (a negative verdict with no
 * eligible human) come back in `skipped` with the reason rather than opening a
 * round that would waste everyone's stake.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")?.trim();
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

  const { opened, skipped } = await openPendingRounds(limit);
  return NextResponse.json({ opened: opened.length, skipped, openedIds: opened });
}
