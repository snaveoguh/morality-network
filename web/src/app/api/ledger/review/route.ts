// Human review gate API (operator-gated).
// GET  — proposals awaiting review, with their claims.
// POST — {resolutionId, action: 'approve'|'reject', note?} — approval records
//        the reviewer identity and publishes; rejection leaves the claim
//        unresolved. This endpoint is the ONLY publication path for verdicts.
//      — {action: 'propose', claimId, verdict, reasoning, evidence} — queues a
//        HUMAN-proposed verdict for a claim the agent does not cover; it joins
//        the same queue and still publishes only through 'approve'.

import { NextResponse } from "next/server";
import {
  getOperatorAuthState,
  verifyOperatorAuth,
} from "@/lib/operator-auth";
import {
  approveResolution,
  claimIdsWithLiveResolution,
  createManualResolution,
  listReviewQueue,
  rejectResolution,
} from "@/lib/db/ledger-resolutions";
import type { LedgerEvidence } from "@/lib/ledger/types";

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

// Evidence validation shared by 'approve' (reviewer-curated additions) and
// 'propose' (the proposal's document chain — OBR reports, judgments,
// inquiries; spec's human-curated sources). Strictly validated: returns null
// when any item is malformed.
const EVIDENCE_KINDS = new Set(["division", "ons", "hansard", "obr", "other"]);
const VERDICTS = new Set(["true", "false", "partial", "unresolved"]);

function parseEvidence(
  input: Array<{ url?: string; excerpt?: string; kind?: string }>,
): LedgerEvidence[] | null {
  const parsed: LedgerEvidence[] = [];
  for (const e of input.slice(0, 10)) {
    const url = e.url?.trim();
    const excerpt = e.excerpt?.trim();
    const kind = e.kind?.trim();
    if (
      !url ||
      !/^https:\/\//.test(url) ||
      !excerpt ||
      excerpt.length < 10 ||
      excerpt.length > 600 ||
      !kind ||
      !EVIDENCE_KINDS.has(kind)
    ) {
      return null;
    }
    parsed.push({ url, excerpt, kind: kind as LedgerEvidence["kind"] });
  }
  return parsed;
}

export async function POST(request: Request) {
  const authError = await verifyOperatorAuth(request);
  if (authError) return authError;
  const dbError = hasDb();
  if (dbError) return dbError;

  let body: {
    resolutionId?: string;
    action?: string;
    note?: string;
    claimId?: string;
    verdict?: string;
    reasoning?: string;
    evidence?: Array<{ url?: string; excerpt?: string; kind?: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const auth = await getOperatorAuthState(request);
  const operator = `human:${auth.address ?? auth.via ?? "operator"}`;

  if (body.action === "propose") {
    const claimId = body.claimId?.trim();
    if (!claimId || !/^[0-9a-f]{32}$/.test(claimId)) {
      return NextResponse.json(
        { error: "claimId must be a 32-hex claim id" },
        { status: 400 },
      );
    }
    const verdict = body.verdict?.trim();
    if (!verdict || !VERDICTS.has(verdict)) {
      return NextResponse.json(
        { error: "verdict must be 'true'|'false'|'partial'|'unresolved'" },
        { status: 400 },
      );
    }
    const reasoning = body.reasoning?.trim();
    if (!reasoning || reasoning.length < 20 || reasoning.length > 1200) {
      return NextResponse.json(
        { error: "reasoning must be 20-1200 chars" },
        { status: 400 },
      );
    }
    const evidence = parseEvidence(
      Array.isArray(body.evidence) ? body.evidence : [],
    );
    if (!evidence) {
      return NextResponse.json(
        { error: "each evidence item needs https url, 10-600 char excerpt, valid kind" },
        { status: 400 },
      );
    }
    if (verdict !== "unresolved" && evidence.length === 0) {
      return NextResponse.json(
        { error: "every verdict except 'unresolved' needs at least one evidence entry" },
        { status: 400 },
      );
    }

    const id = await createManualResolution({
      claimId,
      verdict,
      evidence,
      reasoning,
      proposedBy: operator,
    });
    if (!id) {
      const live = await claimIdsWithLiveResolution([claimId]);
      if (live.has(claimId)) {
        return NextResponse.json(
          { error: "claim already has a live resolution" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "claim not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      resolutionId: id,
      action: "propose",
      proposedBy: operator,
    });
  }

  const { resolutionId, action, note } = body;
  if (!resolutionId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "resolutionId and action ('approve'|'reject'|'propose') required" },
      { status: 400 },
    );
  }

  // Optional reviewer-curated evidence on approval. Same strict validation.
  let extraEvidence: LedgerEvidence[] | undefined;
  if (action === "approve" && Array.isArray(body.evidence)) {
    const parsed = parseEvidence(body.evidence);
    if (!parsed) {
      return NextResponse.json(
        { error: "each evidence item needs https url, 10-600 char excerpt, valid kind" },
        { status: 400 },
      );
    }
    extraEvidence = parsed;
  }

  const changed =
    action === "approve"
      ? await approveResolution(resolutionId, operator, note, extraEvidence)
      : await rejectResolution(resolutionId, operator, note);

  if (!changed) {
    return NextResponse.json(
      { error: "resolution not found or already reviewed" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, resolutionId, action, reviewer: operator });
}
