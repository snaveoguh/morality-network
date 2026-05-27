// POST /api/v1/agents/[id]/skill — worker-only skill dispatcher.
//
// Body: { skill: string, params: object }. The named skill from
// web/src/lib/wallets/skills/ is parsed + executed via the agent's SCW.
// Auth: HMAC (same as /tx). Idempotency is the skill's responsibility
// (most are not; rely on the SCW's nonce to dedupe concurrent calls).

import { NextResponse } from "next/server";
import { getOrCreateAgentWallet, smartWalletsEnabled } from "@/lib/wallets";
import { isAgentId } from "@/lib/wallets/agent-ids";
import { getSkill, listSkills } from "@/lib/wallets/skills";
import {
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  verifyRequest,
} from "@/lib/wallets/hmac";

interface SkillBody {
  skill?: string;
  params?: unknown;
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

  let body: SkillBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as SkillBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.skill || typeof body.skill !== "string") {
    return NextResponse.json({ error: "missing 'skill'" }, { status: 400 });
  }
  const handler = getSkill(body.skill);
  if (!handler) {
    return NextResponse.json(
      { error: `unknown skill '${body.skill}'`, available: listSkills() },
      { status: 400 },
    );
  }

  let parsedParams: unknown;
  try {
    parsedParams = handler.parse(body.params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `bad params: ${message}` }, { status: 400 });
  }

  try {
    const wallet = await getOrCreateAgentWallet(id);
    const result = await handler.run({ agentId: id, wallet }, parsedParams);
    return NextResponse.json({
      agentId: id,
      address: wallet.address,
      skill: handler.name,
      txHash: result.txHash,
      extraTxHashes: result.extraTxHashes,
      meta: result.meta,
      chainId: 8453,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, agentId: id, skill: handler.name }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ skills: listSkills() });
}
