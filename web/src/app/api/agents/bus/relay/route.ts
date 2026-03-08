// ─── POST /api/agents/bus/relay — Receive messages from remote bus ──────────
//
// noun.wtf (or any bridged site) POSTs messages here.
// We validate the shared secret, then re-publish locally with _bridged: true
// to prevent infinite relay loops.

import { NextResponse } from "next/server";
import { messageBus } from "@/lib/agents/core";
import type { AgentMessage } from "@/lib/agents/core";

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
