// POST /api/v1/agents/[id]/tx — worker-only signing API.
//
// Standalone agent processes (agents/pooter1, agents/polypooter) call this
// endpoint to send a Base transaction through their per-agent ERC-4337 Kernel
// smart wallet. Auth is HMAC-SHA256 over `${ts}.${method}.${path}.${bodyHash}`
// using AGENT_WORKER_HMAC_SECRET, with a 60-second replay window.
//
// Required env: BASE_SMART_WALLETS_ENABLED, AGENT_WALLETS_MASTER_SEED,
// PIMLICO_API_KEY, AGENT_WORKER_HMAC_SECRET.

import { NextResponse } from "next/server";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { getOrCreateAgentWallet, smartWalletsEnabled } from "@/lib/wallets";
import { isAgentId } from "@/lib/wallets/agent-ids";
import {
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  verifyRequest,
} from "@/lib/wallets/hmac";

interface TxBody {
  to?: string;
  data?: string;
  value?: string;
}

function parseValue(input: string | undefined): bigint {
  if (input === undefined || input === "" || input === "0") return BigInt(0);
  // Accept hex ("0x…") or decimal string. Reject anything that fails BigInt.
  return BigInt(input);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const rawBody = await request.text();

  const auth = verifyRequest({
    method: "POST",
    path: url.pathname,
    body: rawBody,
    timestampHeader: request.headers.get(HEADER_TIMESTAMP),
    signatureHeader: request.headers.get(HEADER_SIGNATURE),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  if (!isAgentId(id)) {
    return NextResponse.json({ error: "unknown agent" }, { status: 404 });
  }

  if (!smartWalletsEnabled()) {
    return NextResponse.json(
      { error: "smart wallets disabled", agentId: id },
      { status: 503 },
    );
  }

  let body: TxBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as TxBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.to || typeof body.to !== "string" || !isAddress(body.to)) {
    return NextResponse.json({ error: "missing/invalid 'to'" }, { status: 400 });
  }
  if (body.data !== undefined && (typeof body.data !== "string" || !isHex(body.data))) {
    return NextResponse.json({ error: "invalid 'data' (must be hex)" }, { status: 400 });
  }

  let value: bigint;
  try {
    value = parseValue(body.value);
  } catch {
    return NextResponse.json(
      { error: "invalid 'value' (must be decimal or hex string)" },
      { status: 400 },
    );
  }

  try {
    const wallet = await getOrCreateAgentWallet(id);
    const txHash = await wallet.sendTx({
      to: body.to as Address,
      data: (body.data as Hex | undefined) ?? "0x",
      value,
    });
    return NextResponse.json({
      agentId: id,
      address: wallet.address,
      txHash,
      chainId: 8453,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, agentId: id }, { status: 500 });
  }
}
