// GET /api/mp/{memberId}/ties — register-stated ties (pooter.mp_ties view):
// person ↔ organisation/person, tie type, value, period, source. Nothing
// inferred; Electoral Commission / Companies House / APPG rows appear only
// through human-confirmed identity links.

import { corsPreflight, guardRequest, jsonResponse } from "@/lib/mp-record/api";
import { loadMpTies, parseMemberId, recordMeta } from "@/lib/mp-record/record";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const blocked = guardRequest(request);
  if (blocked) return blocked;
  const memberId = parseMemberId((await params).memberId);
  if (memberId === null) return jsonResponse({ error: "memberId must be a Parliament Members API id" }, 400, false);

  const result = await loadMpTies(memberId);
  if (!result) return jsonResponse({ error: "member not in the MP Record" }, 404, false);
  return jsonResponse({
    meta: {
      ...recordMeta(),
      fields: {
        tieType: "'interest:<register category number>' | 'ec_donation' | 'directorship' | 'appg_officer'",
        counterpartyKind: "from the register's own status field: organisation | person | unknown",
        valueGbp: "stated value, exact decimal string; null = not stated in the register",
        paymentRegularity: "set for register category 1.2 (ongoing paid employment): valueGbp is per this period (e.g. 'Monthly'), NOT a total; null = one-off value",
        registerWording: "the register's own words for the entry",
      },
    },
    data: { memberId, name: result.name, ties: result.ties },
  });
}
