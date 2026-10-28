// GET /api/mp/{memberId} — one MP's record as JSON (docs/MP_RECORD_SPEC.md §8).
// CORS-open for researchers. Facts from official registers only; external
// registers appear only through human-confirmed identity links.

import { corsPreflight, guardRequest, jsonResponse } from "@/lib/mp-record/api";
import { loadMpRecord, parseMemberId, recordMeta } from "@/lib/mp-record/record";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;
  const memberId = parseMemberId((await params).memberId);
  if (memberId === null) return jsonResponse({ error: "memberId must be a Parliament Members API id" }, 400, false);

  const record = await loadMpRecord(memberId);
  if (!record) return jsonResponse({ error: "member not in the MP Record" }, 404, false);

  const version = (v: { sourceRecordId: string; sourceUrl: string; sourceApiUrl: string; retrievedAt: string; contentHash: string; version: number }) => ({
    sourceRecordId: v.sourceRecordId,
    sourceUrl: v.sourceUrl,
    sourceApiUrl: v.sourceApiUrl,
    retrievedAt: v.retrievedAt,
    contentHash: v.contentHash,
    version: v.version,
  });

  return jsonResponse({
    meta: recordMeta(),
    data: {
      memberId,
      name: record.name,
      profile: { ...record.member!.data, provenance: version(record.member!) },
      periods: record.periods.map((p) => ({ ...p.data, provenance: version(p) })),
      interests: record.interests.map((i) => ({ ...i.data, provenance: version(i) })),
      noLongerInRegister: record.removedInterests.map((i) => ({
        interestId: i.data.interestId,
        summary: i.data.summary,
        categoryNumber: i.data.categoryNumber,
        absentFromRegisterAsOf: i.retrievedAt,
        provenance: version(i),
      })),
      donations: record.donations.map((d) => ({ ...d.data, provenance: version(d) })),
      identityLinksAwaitingReview: record.pendingLinkCount,
      claims: record.claims.map((c) => ({
        id: c.id,
        verbatimQuote: c.verbatimQuote,
        claimType: c.claimType,
        utteredAt: c.utteredAt,
        context: c.context,
        sourceUrl: c.sourceUrl,
      })),
      stats: record.stats,
      sourceChecks: record.checks,
      corrections: record.corrections,
      replies: record.replies,
      ties: `/api/mp/${memberId}/ties`,
    },
  });
}
