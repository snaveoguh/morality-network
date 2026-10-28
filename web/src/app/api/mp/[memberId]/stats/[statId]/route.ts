// GET /api/mp/{memberId}/stats/{statId}?asOf=YYYY-MM-DD — one reproducible
// stat with its methodology, the rows it used and a citation string.

import { corsPreflight, guardRequest, jsonResponse } from "@/lib/mp-record/api";
import { loadMpStat, parseMemberId, recordMeta, todayIso } from "@/lib/mp-record/record";
import { isStatId, STAT_DEFINITIONS } from "@/lib/mp-record/stats";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ memberId: string; statId: string }> },
) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;
  const { memberId: rawId, statId } = await params;
  const memberId = parseMemberId(rawId);
  if (memberId === null) return jsonResponse({ error: "memberId must be a Parliament Members API id" }, 400, false);
  if (!isStatId(statId)) {
    return jsonResponse({ error: "unknown stat", stats: Object.keys(STAT_DEFINITIONS) }, 404, false);
  }
  const asOf = new URL(request.url).searchParams.get("asOf") ?? todayIso();
  const result = await loadMpStat(memberId, statId, asOf);
  if (!result.ok) return jsonResponse({ error: result.error }, result.status, false);
  return jsonResponse({ meta: recordMeta(), data: result.stat });
}
