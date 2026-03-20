import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { markOnchain } from "@/lib/editorial-archive";

/**
 * POST /api/editorial/mark-onchain
 * Marks an editorial as published onchain. Requires CRON_SECRET bearer token.
 */
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { entityHash, txHash } = body;

    if (
      typeof entityHash !== "string" ||
      typeof txHash !== "string" ||
      !entityHash.startsWith("0x") ||
      !txHash.startsWith("0x")
    ) {
      return NextResponse.json(
        { error: "Invalid entityHash or txHash" },
        { status: 400 },
      );
    }

    await markOnchain(entityHash, txHash);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/editorial/mark-onchain] error:", err);
    return NextResponse.json(
      { error: "Failed to mark onchain" },
      { status: 500 },
    );
  }
}
