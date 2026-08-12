import { NextRequest, NextResponse } from "next/server";

import { consumeLoginToken, getAccountById } from "@/lib/accounts";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.redirect(new URL("/account?error=link_invalid", request.url));
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return NextResponse.redirect(new URL("/account?error=link_invalid", request.url));
  }

  const session = await getSession();
  session.accountId = accountId;
  session.accountEmail = account.email;
  await session.save();

  return NextResponse.redirect(new URL("/account", request.url));
}
