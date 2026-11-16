import { NextRequest, NextResponse } from "next/server";

import {
  confirmSubscriber,
  describeStoreError,
  getNewsletterRedis,
} from "@/lib/newsletter/store";
import { verifyNewsletterToken } from "@/lib/newsletter/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/newsletter/confirm?token=...
 *
 * Second half of the double opt-in: moves a pending sign-up onto the
 * subscriber list. Called by the button on /subscribe/confirm, which is where
 * the emailed link lands.
 *
 * Deliberately POST only. Mail scanners and link previewers fetch every URL
 * in an email with GET; if that confirmed the sign-up, anyone could subscribe
 * an address that sits behind such a scanner.
 */
export async function POST(request: NextRequest) {
  const link = verifyNewsletterToken("confirm", request.nextUrl.searchParams.get("token"));
  if (!link) {
    return NextResponse.json(
      { error: "This confirmation link is not valid or has expired." },
      { status: 400 },
    );
  }

  const redis = getNewsletterRedis();
  if (!redis) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  try {
    const outcome = await confirmSubscriber(redis, link.email, link.expiresAt);
    if (outcome === "not_pending") {
      return NextResponse.json(
        {
          error:
            "This confirmation link has expired, was already used, or was replaced by a newer one.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ status: outcome });
  } catch (error) {
    console.error("[newsletter] Confirm failed:", describeStoreError(error));
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
