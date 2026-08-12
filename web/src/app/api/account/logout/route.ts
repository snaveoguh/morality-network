import { NextRequest, NextResponse } from "next/server";

import { revokeApiToken } from "@/lib/api-tokens";
import { bearerToken } from "@/lib/auth-context";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/logout — signs out however the caller is signed in:
 * a presented bearer token is revoked, and the session cookie is cleared.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (token) {
    await revokeApiToken(token);
  }
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ status: "signed_out" });
}
