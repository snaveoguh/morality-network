import { NextRequest, NextResponse } from "next/server";

import { getMyAssignments, openPendingRounds } from "@/lib/ledger/review-staking";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET?.trim();

/**
 * GET /api/review/open-rounds — the caller's open review rounds, session
 * cookie or bearer token (canonical extension/mobile shape). Auth is
 * optional: an unauthenticated caller gets an empty list, not a 401 —
 * rounds are assignment-scoped, so there is nothing public to show. Same
 * underlying data as GET /api/review/assignments; nothing about any other
 * reviewer's vote leaves here either.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ rounds: [], authenticated: false });
  }
  const assignments = await getMyAssignments(auth.accountId);
  return NextResponse.json({
    rounds: assignments.map((a) => ({
      roundId: a.roundId,
      assignmentId: a.assignmentId,
      claimText: a.normalizedClaim || a.verbatimQuote,
      entity: a.speakerName,
      closesAt: a.expiresAt,
      state: a.state,
      verdict: a.verdict,
      stakeMo: a.stakeMo,
      rewardMo: a.rewardMo,
      evidence: a.evidence,
      sourceUrl: a.sourceUrl,
    })),
  });
}

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
