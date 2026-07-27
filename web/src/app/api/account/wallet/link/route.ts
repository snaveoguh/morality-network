import { NextRequest, NextResponse } from "next/server";

import { linkWallet } from "@/lib/account-wallets";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/wallet/link  { address, signature, nonce, origin }
 *
 * Links a self-custody wallet. The body carries a public address and a
 * signature — never a private key or mnemonic. If a request ever arrives here
 * containing key material, that is a client bug and the key is burned.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accountId || !session.accountEmail) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { address?: string; signature?: string; nonce?: string; origin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { address, signature, nonce } = body;
  const origin = body.origin === "connected" ? "connected" : "generated";
  if (!address || !signature || !nonce) {
    return NextResponse.json({ error: "Missing address, signature or nonce" }, { status: 400 });
  }

  const result = await linkWallet({
    accountId: session.accountId,
    email: session.accountEmail,
    address,
    signature,
    nonce,
    origin,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ status: "linked", wallet: result.wallet });
}
