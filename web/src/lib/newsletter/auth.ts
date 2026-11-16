import "server-only";

import crypto from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Gate for the newsletter's operator endpoints (send, list, remove).
 *
 * Returns a 401 response unless the request carries
 * `Authorization: Bearer <CRON_SECRET>`, or null when it does.
 *
 * Fails closed: with CRON_SECRET unset nobody is authorised, in every
 * environment. `verifyCronAuth` in lib/cron-auth.ts skips the check outside
 * production, which is not acceptable for an endpoint that emails the list.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || !auth || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  // Hash first so the comparison is over equal-length buffers whatever was sent.
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}
