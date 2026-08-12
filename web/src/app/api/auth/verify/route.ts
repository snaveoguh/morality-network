import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { siweLogin } from "@/lib/siwe-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify  { message, signature }
 *
 * SIWE cookie login. Verification itself lives in lib/siwe-login.ts, shared
 * with POST /api/auth/token. If the address is linked to a platform account
 * the session also carries accountId/accountEmail (identity contract v1).
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    return NextResponse.json(
      { error: "Session unavailable", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }

  let message: unknown;
  let signature: unknown;
  try {
    ({ message, signature } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof message !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await siweLogin(session, message, signature);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.debug ? { debug: result.debug } : {}) },
      { status: result.status },
    );
  }

  return NextResponse.json({
    authenticated: true,
    address: result.address,
    chainId: result.chainId,
    accountId: result.accountId,
  });
}
