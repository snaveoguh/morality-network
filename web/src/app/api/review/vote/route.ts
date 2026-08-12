import { NextRequest, NextResponse } from "next/server";

import {
  acceptAssignment,
  castVote,
  findMyAssignment,
  type ReviewVote,
} from "@/lib/ledger/review-staking";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ReviewVote[] = ["approve", "reject", "more_evidence"];

/**
 * POST /api/review/vote { assignmentId | roundId, vote, basis, evidenceIndex }
 *
 * Session cookie or bearer token. Bearer clients may address the vote by
 * roundId alone — the caller's assignment is resolved (and auto-accepted,
 * which locks their stake) so a one-tap extension flow works. The staking
 * invariants are NOT relaxed: `basis` (a sentence, ≥20 chars) is always
 * required, and an approval must cite the settling evidence.
 *
 * The response never reveals the running tally — only whether the round has
 * now settled. A reviewer learning "two approvals so far" before voting is the
 * failure this whole mechanism exists to prevent.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    assignmentId?: string;
    roundId?: string;
    vote?: string;
    basis?: string;
    evidenceIndex?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { vote, basis } = body;
  if (!vote || !VALID.includes(vote as ReviewVote)) {
    return NextResponse.json({ error: "Missing or invalid vote" }, { status: 400 });
  }

  let assignmentId = body.assignmentId;
  if (!assignmentId && body.roundId) {
    const assignment = await findMyAssignment(auth.accountId, body.roundId);
    if (!assignment) {
      return NextResponse.json({ error: "No open assignment in that round" }, { status: 400 });
    }
    assignmentId = assignment.assignmentId;
    if (assignment.state === "assigned") {
      // Voting by roundId implies accepting: lock the stake first.
      const accepted = await acceptAssignment(assignmentId, auth.accountId);
      if (!accepted.ok) {
        return NextResponse.json({ error: accepted.error }, { status: 400 });
      }
    }
  }
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignmentId or roundId" }, { status: 400 });
  }

  const result = await castVote({
    assignmentId,
    accountId: auth.accountId,
    vote: vote as ReviewVote,
    basis: basis ?? "",
    evidenceIndex: body.evidenceIndex ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: "voted", settled: result.settled });
}
