import { NextRequest, NextResponse } from "next/server";

import { acceptAssignment } from "@/lib/ledger/review-staking";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/review/accept { assignmentId } — locks the reviewer's stake. Session cookie or bearer token. */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let assignmentId: string;
  try {
    ({ assignmentId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
  }

  const result = await acceptAssignment(assignmentId, auth.accountId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: "accepted" });
}
