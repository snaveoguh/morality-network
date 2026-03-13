import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { getSession } from "@/lib/session";

function getExpectedDomain(request: Request): string {
  return new URL(request.url).host;
}

export async function POST(request: Request) {
  const session = await getSession();

  try {
    const { message, signature } = await request.json();
    if (typeof message !== "string" || typeof signature !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!session.nonce) {
      return NextResponse.json({ error: "Missing SIWE nonce" }, { status: 400 });
    }

    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify(
      {
        signature,
        nonce: session.nonce,
        domain: getExpectedDomain(request),
      },
      { suppressExceptions: true },
    );

    if (!result.success) {
      session.destroy();
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    session.address = result.data.address;
    session.chainId = result.data.chainId;
    session.siweIssuedAt = result.data.issuedAt ?? new Date().toISOString();
    delete session.nonce;
    await session.save();

    return NextResponse.json({
      authenticated: true,
      address: result.data.address,
      chainId: result.data.chainId,
    });
  } catch (error) {
    session.destroy();
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 }
    );
  }
}
