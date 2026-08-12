import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/account/logout — clears the account session. */
export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ status: "signed_out" });
}
