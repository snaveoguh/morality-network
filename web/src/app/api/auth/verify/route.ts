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
      console.error("[auth/verify] No nonce in session. Cookie may not have been sent back.");
      return NextResponse.json({ error: "Missing SIWE nonce — session cookie not found. Clear cookies and retry." }, { status: 400 });
    }

    const expectedDomain = getExpectedDomain(request);
    const siweMessage = new SiweMessage(message);

    console.log("[auth/verify] Verifying:", {
      sessionNonce: session.nonce,
      messageNonce: siweMessage.nonce,
      expectedDomain,
      messageDomain: siweMessage.domain,
      address: siweMessage.address,
    });

    const result = await siweMessage.verify(
      {
        signature,
        nonce: session.nonce,
        domain: expectedDomain,
      },
      { suppressExceptions: true },
    );

    if (!result.success) {
      console.error("[auth/verify] Verification failed:", {
        error: result.error,
        expectedDomain,
        messageDomain: siweMessage.domain,
        nonceMatch: session.nonce === siweMessage.nonce,
      });
      session.destroy();
      return NextResponse.json({
        error: "Invalid signature",
        debug: {
          domainMatch: expectedDomain === siweMessage.domain,
          nonceMatch: session.nonce === siweMessage.nonce,
          expectedDomain,
          messageDomain: siweMessage.domain,
        }
      }, { status: 401 });
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
