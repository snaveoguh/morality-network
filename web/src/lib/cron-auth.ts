import "server-only";

/**
 * Verify that an incoming request is from the configured scheduler or another
 * authorized caller.
 *
 * Scheduled jobs and protected mutation endpoints are expected to send
 * `Authorization: Bearer <CRON_SECRET>`. This utility checks that header so
 * these routes cannot be triggered by random external requests.
 *
 * Usage:
 *   import { verifyCronAuth } from "@/lib/cron-auth";
 *
 *   export async function GET(request: Request) {
 *     const authError = verifyCronAuth(request);
 *     if (authError) return authError;
 *     // ... handler logic
 *   }
 */

import { NextResponse } from "next/server";

/**
 * Returns a 401 NextResponse if the request is not authorized, or null if OK.
 * Checks `Authorization: Bearer <CRON_SECRET>` header.
 *
 * In development (NODE_ENV !== "production"), auth is skipped so you can test
 * endpoints locally without setting CRON_SECRET.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  // Skip auth in development for local testing
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // CRON_SECRET not configured — block all requests in production
    console.error("[cron-auth] CRON_SECRET not set — rejecting request");
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET not set" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}
