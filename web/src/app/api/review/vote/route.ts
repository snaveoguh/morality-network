import { NextRequest, NextResponse } from "next/server";

import { castVote, type ReviewVote } from "@/lib/ledger/review-staking";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ReviewVote[] = ["approve", "reject", "more_evidence"];

/**
 * POST /api/review/vote { assignmentId, vote, basis, evidenceIndex }
 *
 * The response never reveals the running tally — only whether the round has
 * now settled. A reviewer learning "two approvals so far" before voting is the
 * failure this whole mechanism exists to prevent.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { assignmentId?: string; vote?: string; basis?: string; evidenceIndex?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { assignmentId, vote, basis } = body;
  if (!assignmentId || !vote || !VALID.includes(vote as ReviewVote)) {
    return NextResponse.json({ error: "Missing or invalid assignmentId/vote" }, { status: 400 });
  }

  const result = await castVote({
    assignmentId,
    accountId: session.accountId,
    vote: vote as ReviewVote,
    basis: basis ?? "",
    evidenceIndex: body.evidenceIndex ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: "voted", settled: result.settled });
}
