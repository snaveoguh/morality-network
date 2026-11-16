import { NextRequest, NextResponse } from "next/server";

import { unsubscribePageUrl } from "@/lib/newsletter/links";
import {
  describeStoreError,
  getNewsletterRedis,
  unsubscribeEmail,
} from "@/lib/newsletter/store";
import { verifyNewsletterToken } from "@/lib/newsletter/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/newsletter/unsubscribe?token=...
 *
 * Removes the address the signed token was minted for. This URL is the
 * `List-Unsubscribe` header of every edition, so a mail client's own
 * "Unsubscribe" button posts here (RFC 8058 one-click); the button on the
 * /unsubscribe page posts here too.
 *
 * The token is the whole authorisation: no cookie, session or secret header
 * is involved, because the mail provider calling this has none of them.
 */
export async function POST(request: NextRequest) {
  const link = verifyNewsletterToken("unsubscribe", request.nextUrl.searchParams.get("token"));
  if (!link) {
    return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 400 });
  }

  const redis = getNewsletterRedis();
  if (!redis) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  try {
    await unsubscribeEmail(redis, link.email);
    return NextResponse.json({ status: "unsubscribed" });
  } catch (error) {
    console.error("[newsletter] Unsubscribe failed:", describeStoreError(error));
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/**
 * GET /api/newsletter/unsubscribe?token=...
 *
 * Some mail clients open the List-Unsubscribe URL in a browser instead of
 * posting to it. Send them to the page with the confirm button. GET never
 * unsubscribes: link scanners fetch every URL in an email.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(unsubscribePageUrl(token));
}
