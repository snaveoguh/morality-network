// Right of reply.
// POST (public, rate-limited) — raise a dispute against a claim. Disputes are
//   NOT displayed until an operator answers them; office verification happens
//   out of band before answering.
// PUT (operator) — moderate: answer (publishes dispute + response inline) or
//   withdraw.

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyOperatorAuth } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function requireDb(): NextResponse | null {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "disputes require DATABASE_URL" },
      { status: 503 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, { maxRequests: 5, windowMs: 3_600_000 });
  if (limited) return limited;
  const dbError = requireDb();
  if (dbError) return dbError;

  let body: {
    claimId?: string;
    body?: string;
    contact?: string;
    identity?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const claimId = body.claimId?.trim();
  const text = body.body?.trim();
  const contact = body.contact?.trim();
  if (!claimId || !/^[a-f0-9]{32}$/.test(claimId)) {
    return NextResponse.json({ error: "valid claimId required" }, { status: 400 });
  }
  if (!text || text.length < 20 || text.length > 4000) {
    return NextResponse.json(
      { error: "dispute body must be 20-4000 characters" },
      { status: 400 },
    );
  }
  if (!contact || contact.length < 5 || contact.length > 200) {
    return NextResponse.json(
      { error: "a contact (email) is required so we can verify and reply" },
      { status: 400 },
    );
  }

  const identity = body.identity?.trim().slice(0, 200);
  const raisedBy = identity
    ? `claimed:${identity} <${contact}>`
    : `public:${contact}`;

  const { createDispute } = await import("@/lib/db/ledger-disputes");
  const id = await createDispute({ claimId, body: text, raisedBy });
  if (!id) {
    return NextResponse.json(
      { error: "claim not found or dispute already submitted" },
      { status: 409 },
    );
  }
  return NextResponse.json({
    ok: true,
    disputeId: id,
    note: "Disputes display after verification and response. We will contact you.",
  });
}

export async function PUT(request: Request) {
  const authError = await verifyOperatorAuth(request);
  if (authError) return authError;
  const dbError = requireDb();
  if (dbError) return dbError;

  let body: { disputeId?: string; action?: string; response?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { disputeId, action, response } = body;
  if (!disputeId || (action !== "answer" && action !== "withdraw")) {
    return NextResponse.json(
      { error: "disputeId and action ('answer'|'withdraw') required" },
      { status: 400 },
    );
  }
  if (action === "answer" && (!response || response.trim().length < 10)) {
    return NextResponse.json(
      { error: "answering requires a response (min 10 chars)" },
      { status: 400 },
    );
  }

  const { moderateDispute } = await import("@/lib/db/ledger-disputes");
  const changed = await moderateDispute(disputeId, action, response?.trim());
  if (!changed) {
    return NextResponse.json(
      { error: "dispute not found or already moderated" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, disputeId, action });
}

export async function GET(request: Request) {
  const authError = await verifyOperatorAuth(request);
  if (authError) return authError;
  const dbError = requireDb();
  if (dbError) return dbError;
  const { listOpenDisputes } = await import("@/lib/db/ledger-disputes");
  return NextResponse.json({ open: await listOpenDisputes() });
}
