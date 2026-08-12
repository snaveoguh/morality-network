import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";

import { findAccountIdByAddress } from "@/lib/account-wallets";
import { mintApiToken } from "@/lib/api-tokens";
import { getSession } from "@/lib/session";
import { siweLogin, siweVerifyStateless } from "@/lib/siwe-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/token — mint a bearer token (identity contract v1).
 *
 * Two ways in:
 *   { method: "siwe", message, signature }  — fresh SIWE (EIP-4361) proof.
 *     If the message nonce matches a session nonce from GET /api/auth/nonce,
 *     it is consumed (same flow as /api/auth/verify). Otherwise the nonce is
 *     treated as CLIENT-generated and verified statelessly: signature +
 *     issued-at freshness window (±10 min) — the cookieless extension/mobile
 *     path.
 *   (empty body)                            — an already-authenticated
 *     iron-session cookie (email login or prior SIWE login).
 *
 * Optional { scopes: string[] } narrows the token; default is full access.
 * Returns { token: "pat_...", expiresAt } — the raw token is never stored,
 * only its SHA-256 (pooter.api_tokens). Default expiry 90 days.
 */

const MAX_SCOPES = 16;

function sanitizeScopes(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const scopes = input
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 64)
    .slice(0, MAX_SCOPES);
  return scopes.length > 0 ? scopes : undefined;
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    return NextResponse.json(
      { error: "Session unavailable", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }

  let body: { method?: string; message?: unknown; signature?: unknown; scopes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {}; // empty body is fine for the session-cookie path
  }
  const scopes = sanitizeScopes(body.scopes);

  if (body.method === "siwe") {
    if (typeof body.message !== "string" || typeof body.signature !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Session-nonce flow only when this message was built from OUR nonce;
    // anything else is the stateless client-nonce flow.
    let messageNonce: string | null = null;
    try {
      messageNonce = new SiweMessage(body.message).nonce ?? null;
    } catch {
      messageNonce = null; // let the verifier produce the proper error
    }
    const useSessionNonce = Boolean(session.nonce) && session.nonce === messageNonce;

    const result = useSessionNonce
      ? await siweLogin(session, body.message, body.signature)
      : await siweVerifyStateless(body.message, body.signature);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.debug ? { debug: result.debug } : {}) },
        { status: result.status },
      );
    }
    const minted = await mintApiToken({
      accountId: result.accountId,
      address: result.address,
      scopes,
    });
    return NextResponse.json(minted);
  }

  // Already-authenticated session cookie.
  if (!session.accountId && !session.address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let accountId = session.accountId ?? null;
  if (!accountId && session.address) {
    try {
      accountId = await findAccountIdByAddress(session.address);
    } catch {
      accountId = null; // best-effort join
    }
  }

  const minted = await mintApiToken({
    accountId,
    address: session.address ?? null,
    scopes,
  });
  return NextResponse.json(minted);
}
