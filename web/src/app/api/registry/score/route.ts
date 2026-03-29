import { NextRequest } from "next/server";
import { scoreEntity } from "@/lib/entity-scorer";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/registry/score — Score an entity (URL, contract, domain, address).
 * Returns morality score, bias, risk flags, and AI reasoning.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 scores per minute per IP
  const limited = rateLimit(request, { maxRequests: 10, windowMs: 60_000 });
  if (limited) return limited;

  let body: { identifier?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { identifier } = body;
  if (!identifier || typeof identifier !== "string" || identifier.length > 2000) {
    return Response.json({ error: "identifier required (max 2000 chars)" }, { status: 400 });
  }

  try {
    const score = await scoreEntity(identifier);
    return Response.json(score);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scoring failed";
    console.error("[registry/score] Error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
