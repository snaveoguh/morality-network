// Bearer-token gate for treasury endpoints. Use a dedicated env var so
// regular cron callers can't trip into fund-moving routes.

import { NextResponse } from "next/server";

export function requireAdmin(request: Request): NextResponse | null {
  const secret = process.env.TREASURY_ADMIN_TOKEN?.trim();
  if (!secret || secret.length < 24) {
    return NextResponse.json(
      { error: "TREASURY_ADMIN_TOKEN not set (need ≥24 chars)" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
