// ─── POST /api/agents/bus/relay — Receive messages from remote bus ──────────
//
// noun.wtf (or any bridged site) POSTs messages here.
// We validate the shared secret, then re-publish locally with _bridged: true
// to prevent infinite relay loops.

import { NextResponse } from "next/server";
import { messageBus } from "@/lib/agents/core";
import type { AgentMessage } from "@/lib/agents/core";
import {
  bridgeSignatureIsRequired,
  verifyBridgeMessage,
} from "@/lib/agents/core/bridge-signature";
import { buildHumanPromptMeta } from "@/lib/agents/core/human-prompt-meta";

export const dynamic = "force-dynamic";

const BRIDGE_SECRET = process.env.AGENT_BRIDGE_SECRET || "";

export async function POST(request: Request) {
  // Validate shared secret
  if (!BRIDGE_SECRET) {
    return NextResponse.json(
      { error: "Bridge not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token !== BRIDGE_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const message = (await request.json()) as AgentMessage;

    // Validate minimal message shape
    if (!message.id || !message.from || !message.topic) {
      return NextResponse.json(
        { error: "Invalid message format" },
        { status: 400 }
      );
    }

    const verification = await verifyBridgeMessage({
      message,
      headers: request.headers,
      expectedAudience: new URL(request.url).origin,
    });
    const signatureRequired = bridgeSignatureIsRequired();
    if (signatureRequired && (!verification.present || !verification.verified || !verification.trusted)) {
      return NextResponse.json(
        {
          error: verification.reason || "Bridge signature verification failed",
          verification,
        },
        { status: 401 },
      );
    }

    const relayedFrom =
      verification.origin ||
      request.headers.get("x-agent-origin") ||
      request.headers.get("origin") ||
      request.headers.get("referer") ||
      request.headers.get("x-forwarded-host") ||
      null;
    const receivedAt = Date.now();

    const humanPromptMeta = await buildHumanPromptMeta(message, {
      headers: request.headers,
      relayedFrom,
      receivedAt,
    });

    message.meta = {
      ...(message.meta ?? {}),
      relayedFrom,
      receivedAt,
      bridge: verification,
      ...(humanPromptMeta ?? {}),
    };

    if (message.meta.humanPrompt) {
      console.info("[BusRelay] Human prompt received", {
        messageId: message.id,
        topic: message.topic,
        from: message.from,
        to: message.to,
        senderEns: message.meta.sender?.ens ?? null,
        senderAddress: message.meta.sender?.address ?? null,
        promptPreview: message.meta.promptPreview ?? null,
      });
    }

    // Mark as bridged to prevent relay loops
    message._bridged = true;

    // Re-publish locally
    await messageBus.publish(message);

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (err) {
    console.error("[BusRelay] Error processing relayed message:", err);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
