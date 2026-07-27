import { NextResponse } from "next/server";

import { createLinkNonce } from "@/lib/account-wallets";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/account/wallet/nonce — mint a single-use challenge to sign. */
export async function POST() {
  const session = await getSession();
  if (!session.accountId || !session.accountEmail) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const nonce = await createLinkNonce(session.accountId);
  return NextResponse.json({ nonce, email: session.accountEmail });
}
