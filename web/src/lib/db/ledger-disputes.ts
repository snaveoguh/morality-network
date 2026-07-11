// ledger_disputes repo — right of reply (spec §Legal guardrails).
// Anyone may raise a dispute against a claim; disputes display publicly only
// after an operator answers them (which is also where office verification
// happens, out of band, in v1). Schema: migration 003.

import { createHash } from "node:crypto";
import { sql } from "../db";

export interface LedgerDispute {
  id: string;
  claimId: string;
  raisedBy: string;
  body: string;
  status: "open" | "answered" | "withdrawn";
  response: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface DisputeRow {
  id: string;
  claim_id: string;
  raised_by: string;
  body: string;
  status: LedgerDispute["status"];
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

function rowToDispute(row: DisputeRow): LedgerDispute {
  return {
    id: row.id,
    claimId: row.claim_id,
    raisedBy: row.raised_by,
    body: row.body,
    status: row.status,
    response: row.response,
    createdAt: new Date(row.created_at).toISOString(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
  };
}

export async function createDispute(params: {
  claimId: string;
  body: string;
  raisedBy: string;
}): Promise<string | null> {
  // One open dispute per (claim, raiser); repeat submissions are no-ops.
  const id = createHash("sha256")
    .update(`${params.claimId}\n${params.raisedBy}\n${params.body}`)
    .digest("hex")
    .slice(0, 32);
  const rows = await sql`
    INSERT INTO pooter.ledger_disputes (id, claim_id, raised_by, body)
    SELECT ${id}, ${params.claimId}, ${params.raisedBy}, ${params.body}
    WHERE EXISTS (SELECT 1 FROM pooter.ledger_claims WHERE id = ${params.claimId})
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0 ? id : null;
}

/** Answered disputes for public display, keyed by claim id. */
export async function answeredDisputesForClaims(
  claimIds: string[],
): Promise<Map<string, LedgerDispute[]>> {
  if (claimIds.length === 0) return new Map();
  const rows = await sql<DisputeRow[]>`
    SELECT * FROM pooter.ledger_disputes
    WHERE claim_id IN ${sql(claimIds)} AND status = 'answered'
    ORDER BY created_at ASC
  `;
  const map = new Map<string, LedgerDispute[]>();
  for (const row of rows) {
    const list = map.get(row.claim_id) ?? [];
    list.push(rowToDispute(row));
    map.set(row.claim_id, list);
  }
  return map;
}

export async function listOpenDisputes(limit = 100): Promise<LedgerDispute[]> {
  const rows = await sql<DisputeRow[]>`
    SELECT * FROM pooter.ledger_disputes
    WHERE status = 'open'
    ORDER BY created_at ASC
    LIMIT ${Math.max(1, Math.min(500, limit))}
  `;
  return rows.map(rowToDispute);
}

/** Operator moderation: answer (makes it public with response) or withdraw. */
export async function moderateDispute(
  disputeId: string,
  action: "answer" | "withdraw",
  response?: string,
): Promise<boolean> {
  const status = action === "answer" ? "answered" : "withdrawn";
  const rows = await sql`
    UPDATE pooter.ledger_disputes
    SET status = ${status}, response = ${response ?? null}, resolved_at = NOW()
    WHERE id = ${disputeId} AND status = 'open'
    RETURNING id
  `;
  return rows.length > 0;
}
