import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/newsletter/auth";
import { deliverIndividually } from "@/lib/newsletter/delivery";
import { confirmationLink } from "@/lib/newsletter/links";
import {
  addPendingSubscriber,
  getNewsletterRedis,
  isValidEmail,
  normalizeEmail,
  PENDING_TTL_MS,
  removePendingSubscriber,
  SUBSCRIBERS_KEY,
  unsubscribeEmail,
} from "@/lib/newsletter/store";
import { newsletterTokensConfigured } from "@/lib/newsletter/tokens";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/newsletter/subscribe  { email }
 *
 * Starts a sign-up to The Daily Pooter. The address is held as pending and
 * emailed a confirmation link; it joins the subscriber list only when that
 * link is followed (see ../confirm), so nobody can sign up an address they do
 * not control.
 *
 * The reply is the same whether the address is new, already pending or
 * already subscribed — otherwise this would be a way to test who subscribes.
 */
export async function POST(request: NextRequest) {
  // Each accepted request can send an email to a stranger. Keep it slow.
  const limited = rateLimit(request, { maxRequests: 10, windowMs: 3_600_000 });
  if (limited) return limited;

  let email: string;
  try {
    const body = await request.json();
    email = normalizeEmail(String(body?.email ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const redis = getNewsletterRedis();
  if (!redis) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }
  if (!newsletterTokensConfigured()) {
    console.error("[newsletter] NEWSLETTER_TOKEN_SECRET not configured — sign-up refused");
    return NextResponse.json({ error: "Sign-ups are not available right now" }, { status: 503 });
  }

  const pending = NextResponse.json({
    status: "pending",
    message: "Check your inbox for a link to confirm your subscription.",
  });

  try {
    const outcome = await addPendingSubscriber(redis, email);
    // Already on the list, or sent a link in the last few minutes: no new email.
    if (outcome !== "pending") return pending;

    const link = confirmationLink(email);
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    if (!resendApiKey) {
      // Same arrangement as the sign-in mailer: without a mail provider the
      // link is logged so local and staging sign-up still works, never returned.
      console.warn(`[newsletter] RESEND_API_KEY unset — confirmation link for ${email}: ${link}`);
      return pending;
    }

    const report = await deliverIndividually(
      [
        {
          to: email,
          subject: "Confirm your subscription to The Daily Pooter",
          html: renderConfirmationEmail(link),
        },
      ],
      {
        apiKey: resendApiKey,
        from: process.env.NEWSLETTER_FROM || "pooter <daily@pooter.world>",
      },
    );
    if (report.sent === 0) {
      console.error("[newsletter] Confirmation email failed:", report.failures[0]?.error);
      // Forget the request so the cooldown does not block a retry.
      await removePendingSubscriber(redis, email);
      return NextResponse.json(
        { error: "We could not send the confirmation email. Try again in a moment." },
        { status: 502 },
      );
    }
    return pending;
  } catch (error) {
    console.error("[newsletter] Sign-up failed:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/**
 * DELETE /api/newsletter/subscribe  { email }
 *
 * Operator removal (needs CRON_SECRET). Subscribers remove themselves with
 * the signed link in every email — see ../unsubscribe.
 */
export async function DELETE(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const redis = getNewsletterRedis();
    if (!redis) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

    await unsubscribeEmail(redis, normalizeEmail(String(email)));
    return NextResponse.json({ status: "unsubscribed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/newsletter/subscribe
 * Get subscriber count (public) or full list (auth required).
 */
export async function GET(request: NextRequest) {
  const redis = getNewsletterRedis();
  if (!redis) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

  const count = await redis.scard(SUBSCRIBERS_KEY);

  // Full list only with auth
  if (!requireCronSecret(request)) {
    const subscribers = await redis.smembers(SUBSCRIBERS_KEY);
    return NextResponse.json({ count, subscribers });
  }

  return NextResponse.json({ count });
}

function renderConfirmationEmail(link: string): string {
  const days = Math.round(PENDING_TTL_MS / 86_400_000);
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fffdf7;border:2px solid #111;padding:32px">
    <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#555">The Daily Pooter</p>
    <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.15;font-weight:600">Confirm your subscription</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.55">Someone asked for the morning brief to be sent to this address. If that was you, confirm below and the next edition will arrive tomorrow morning.</p>
    <p style="margin:0 0 28px">
      <a href="${link}" style="display:inline-block;background:#111;color:#fffdf7;text-decoration:none;padding:14px 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase">Confirm subscription</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#555">If you didn't ask for this, ignore this email and you will not be subscribed. The link expires in ${days} days.</p>
  </div>
</body></html>`;
}
