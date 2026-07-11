// Human review gate API (operator-gated).
// GET  — proposals awaiting review, with their claims.
// POST — {resolutionId, action: 'approve'|'reject', note?} — approval records
//        the reviewer identity and publishes; rejection leaves the claim
//        unresolved. This endpoint is the ONLY publication path for verdicts.

import { NextResponse } from "next/server";
import {
  getOperatorAuthState,
  verifyOperatorAuth,
} from "@/lib/operator-auth";
import {
  approveResolution,
  listReviewQueue,
  rejectResolution,
} from "@/lib/db/ledger-resolutions";

export const dynamic = "force-dynamic";

function hasDb(): NextResponse | null {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "review queue requires DATABASE_URL" },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const authError = await verifyOperatorAuth(request);
  if (authError) return authError;
  const dbError = hasDb();
  if (dbError) return dbError;

  const queue = await listReviewQueue();
  return NextResponse.json({ queue });
}

export async function POST(request: Request) {
  const authError = await verifyOperatorAuth(request);
  if (authError) return authError;
  const dbError = hasDb();
  if (dbError) return dbError;

  let body: { resolutionId?: string; action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { resolutionId, action, note } = body;
  if (!resolutionId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "resolutionId and action ('approve'|'reject') required" },
      { status: 400 },
    );
  }

  const auth = await getOperatorAuthState(request);
  const reviewer = `human:${auth.address ?? auth.via ?? "operator"}`;

  const changed =
    action === "approve"
      ? await approveResolution(resolutionId, reviewer, note)
      : await rejectResolution(resolutionId, reviewer, note);

  if (!changed) {
    return NextResponse.json(
      { error: "resolution not found or already reviewed" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, resolutionId, action, reviewer });
}
