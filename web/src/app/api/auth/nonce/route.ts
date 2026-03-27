import { NextResponse } from "next/server";
import { generateNonce } from "siwe";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  const nonce = generateNonce();
  session.nonce = nonce;
  delete session.address;
  delete session.chainId;
  delete session.siweIssuedAt;
  await session.save();
  return NextResponse.json(
    { nonce },
    {
      headers: {
        "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
        pragma: "no-cache",
      },
    },
  );
}
