import { NextResponse } from "next/server";
import { getAgentAddress, smartWalletsEnabled } from "@/lib/wallets";
import { isAgentId } from "@/lib/wallets/agent-ids";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isAgentId(id)) {
    return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  }

  if (!smartWalletsEnabled()) {
    return NextResponse.json(
      { error: "smart wallets disabled", agentId: id },
      { status: 503 }
    );
  }

  try {
    const address = await getAgentAddress(id);
    return NextResponse.json({ agentId: id, address, chainId: 8453 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, agentId: id }, { status: 500 });
  }
}
