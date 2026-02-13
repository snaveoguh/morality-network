import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

export async function POST(request: Request) {
  try {
    const { message, signature } = await request.json();

    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });

    if (!result.success) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // In production, create a proper session/JWT here
    return NextResponse.json({
      address: result.data.address,
      chainId: result.data.chainId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 }
    );
  }
}
