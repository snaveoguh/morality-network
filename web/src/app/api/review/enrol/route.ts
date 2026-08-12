import { NextRequest, NextResponse } from "next/server";

import { enrolHuman, getReviewerProfile, registerAgent } from "@/lib/ledger/review-staking";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/review/enrol — the signed-in account's reviewer profile, if any.
 * Session cookie or bearer token.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const profile = await getReviewerProfile(auth.accountId);
  return NextResponse.json({ profile });
}

/**
 * POST /api/review/enrol
 *   { kind: 'human', conflicts?: string[] }
 *   { kind: 'agent', modelId: string, label: string }
 *
 * Enrolling an agent registers it under the signed-in account as operator —
 * their MO is what gets staked and slashed for its votes.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { kind?: string; conflicts?: unknown; modelId?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.kind === "agent") {
    if (!body.modelId || !body.label) {
      return NextResponse.json({ error: "Agents need a modelId and a label" }, { status: 400 });
    }
    const result = await registerAgent({
      operatorAccountId: auth.accountId,
      modelId: body.modelId,
      label: body.label,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ status: "registered", agentAccountId: result.agentAccountId });
  }

  const conflicts = Array.isArray(body.conflicts)
    ? body.conflicts.filter((c): c is string => typeof c === "string")
    : [];
  const result = await enrolHuman({ accountId: auth.accountId, conflicts });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: "enrolled" });
}
