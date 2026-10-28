// POST /api/mp/{memberId}/reply — right of reply (MP_RECORD_SPEC §9).
// Replies are NOT displayed until an operator verifies the sender's office
// (out of band) and answers. The contact address is never published.

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { mpLaunchGate } from "@/lib/mp-record/launch-gate";
import { parseMemberId } from "@/lib/mp-record/record";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const limited = rateLimit(request, { maxRequests: 5, windowMs: 3_600_000 });
  if (limited) return limited;
  if (!mpLaunchGate().visible) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "replies require DATABASE_URL" }, { status: 503 });
  }
  const memberId = parseMemberId((await params).memberId);
  if (memberId === null) return NextResponse.json({ error: "invalid memberId" }, { status: 400 });

  let body: { body?: string; contact?: string; identity?: string; subjectTable?: string; subjectRecord?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const text = body.body?.trim();
  const contact = body.contact?.trim();
  if (!text || text.length < 20 || text.length > 4000) {
    return NextResponse.json({ error: "reply must be 20-4000 characters" }, { status: 400 });
  }
  if (!contact || contact.length < 5 || contact.length > 200) {
    return NextResponse.json({ error: "a contact (email) is required so we can verify and reply" }, { status: 400 });
  }
  const subjectTable = ["mp_interests", "mp_donations", "mp_member_periods", "mp_members", "stat"].includes(body.subjectTable ?? "")
    ? body.subjectTable
    : undefined;
  const subjectRecord = body.subjectRecord?.trim().slice(0, 200) || undefined;

  const { createMpReply } = await import("@/lib/db/mp-record");
  const id = await createMpReply({
    memberId,
    subjectTable,
    subjectRecord,
    body: text,
    contact,
    identity: body.identity?.trim().slice(0, 200) || undefined,
  });
  return NextResponse.json({
    ok: true,
    id,
    note: "Received. We verify the sender's office before publishing a reply; it then appears in full beside the record.",
  });
}
