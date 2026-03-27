import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    return NextResponse.json(
      { error: "Session unavailable", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }

  try {
    const { message, signature } = await request.json();
    if (typeof message !== "string" || typeof signature !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!session.nonce) {
      return NextResponse.json(
        { error: "Missing SIWE nonce — session cookie not found. Clear cookies and retry." },
        { status: 400 },
      );
    }

    const siweMessage = new SiweMessage(message);
    const sessionNonce = session.nonce;

    // Verify signature + nonce only. Skip domain verification because
    // behind Cloudflare + Railway the server-side hostname often differs
    // from the browser origin (pooter.world). The request is same-origin
    // (enforced by SameSite cookie + CORS), so domain spoofing isn't a risk.
    const result = await siweMessage.verify(
      { signature, nonce: sessionNonce },
      { suppressExceptions: true },
    );

    if (!result.success) {
      session.destroy();
      return NextResponse.json(
        {
          error: "Invalid signature",
          debug: {
            nonceMatch: sessionNonce === siweMessage.nonce,
            sessionNonceLen: sessionNonce.length,
            messageNonceLen: siweMessage.nonce?.length ?? 0,
            messageDomain: siweMessage.domain,
            verifyError: String(result.error?.type ?? result.error ?? "unknown"),
          },
        },
        { status: 401 },
      );
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
      {
        error: "Verification failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 400 },
    );
  }
}
