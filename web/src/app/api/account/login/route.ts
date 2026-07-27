import { NextRequest, NextResponse } from "next/server";

import { createLoginToken, getAccountByEmail, normalizeEmail } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const ACCOUNT_FROM = process.env.ACCOUNT_FROM || "pooter <accounts@pooter.world>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pooter.world";

/**
 * POST /api/account/login  { email }
 *
 * Sends a single-use magic link. Always responds with the same generic body
 * whether or not the address is registered — otherwise this endpoint becomes
 * a free oracle for "is this person a pooter user", and the legacy list is 401
 * real people's email addresses.
 */
export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = normalizeEmail(String(body?.email ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const generic = NextResponse.json({
    status: "sent",
    message: "If that address has an account, a sign-in link is on its way.",
  });

  const account = await getAccountByEmail(email);
  if (!account) return generic;

  const token = await createLoginToken(String(account.id));
  const link = `${SITE_URL}/api/account/callback?token=${encodeURIComponent(token)}`;

  if (!RESEND_API_KEY) {
    // Without a mail provider the link cannot be delivered. Log it so local
    // and staging sign-in still works, but never leak it in the response.
    console.warn(`[account] RESEND_API_KEY unset — sign-in link for ${email}: ${link}`);
    return generic;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: ACCOUNT_FROM,
        to: [email],
        subject: "Your pooter.world sign-in link",
        html: renderEmail(link),
      }),
    });
    if (!res.ok) {
      console.error("[account] Resend error:", await res.text());
    }
  } catch (err) {
    console.error("[account] send failed:", err);
  }

  return generic;
}

function renderEmail(link: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fffdf7;border:2px solid #111;padding:32px">
    <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c81e1e">pooter.world</p>
    <h1 style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;letter-spacing:-.02em">Sign in to your account</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.55">Your MO balance carried over from morality.network. Use the link below to see it — it works once and expires in 20 minutes.</p>
    <p style="margin:0 0 28px">
      <a href="${link}" style="display:inline-block;background:#111;color:#fffdf7;text-decoration:none;padding:14px 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.14em;text-transform:uppercase">Open my dashboard</a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#555">If you didn't ask for this, ignore it — nothing happens until the link is opened.</p>
  </div>
</body></html>`;
}
