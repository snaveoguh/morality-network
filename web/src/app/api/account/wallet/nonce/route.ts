import { NextRequest, NextResponse } from "next/server";

import { createLinkNonce } from "@/lib/account-wallets";
import { getAccountById } from "@/lib/accounts";
import { getAuthContext } from "@/lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/wallet/nonce — mint a single-use challenge to sign.
 * Session cookie or bearer token; the email in the challenge comes from the
 * account row, so both paths produce the identical message.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth?.accountId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const account = await getAccountById(auth.accountId);
  if (!account) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const nonce = await createLinkNonce(auth.accountId);
  return NextResponse.json({ nonce, email: account.email });
}
