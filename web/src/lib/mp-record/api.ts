// Shared plumbing for the CORS-open MP Record read API (/api/mp/*).

import "server-only";

import { NextResponse } from "next/server";
import { rateLimit } from "../rate-limit";
import { mpLaunchGate } from "./launch-gate";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const CACHE = "public, s-maxage=1800, stale-while-revalidate=86400";

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function jsonResponse(body: unknown, status = 200, cache = status === 200): NextResponse {
  const gate = mpLaunchGate();
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": cache ? CACHE : "no-store",
      ...(gate.signedOff ? {} : { "X-Robots-Tag": "noindex" }),
    },
  });
}

/** Rate limit + launch gate. Returns a response to send, or null to proceed. */
export function guardRequest(request: Request, maxRequests = 60): NextResponse | null {
  const limited = rateLimit(request, { maxRequests, windowMs: 60_000 });
  if (limited) {
    for (const [k, v] of Object.entries(CORS_HEADERS)) limited.headers.set(k, v);
    return limited;
  }
  if (!mpLaunchGate().visible) return jsonResponse({ error: "not found" }, 404, false);
  return null;
}
