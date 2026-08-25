import { NextRequest, NextResponse } from "next/server";

import { consumeLoginToken, getAccountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Behind Railway's proxy request.url is the container origin
// (https://localhost:3000), so redirects must use the canonical site URL —
// same source of truth as the login route that minted the email link.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pooter.world";

/**
 * GET /api/account/callback?token=...
 *
 * Redeems a magic link and starts the session. Redirects rather than returning
 * JSON so the link is clickable straight from the email client.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const accountId = await consumeLoginToken(token);

  if (!accountId) {
    return NextResponse.redirect(new URL("/account?error=link_invalid", SITE_URL));
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return NextResponse.redirect(new URL("/account?error=link_invalid", SITE_URL));
  }

  const session = await getSession();
  session.accountId = accountId;
  session.accountEmail = account.email;
  await session.save();

  return NextResponse.redirect(new URL("/account", SITE_URL));
}
