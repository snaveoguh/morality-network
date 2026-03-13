import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  return NextResponse.json({
    authenticated: Boolean(session.address),
    address: session.address ?? null,
    chainId: session.chainId ?? null,
    issuedAt: session.siweIssuedAt ?? null,
  });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
