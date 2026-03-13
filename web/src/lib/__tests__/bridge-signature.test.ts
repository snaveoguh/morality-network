import { afterEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "../agents/core/types";
import {
  signBridgeMessage,
  verifyBridgeMessage,
} from "../agents/core/bridge-signature";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("bridge-signature", () => {
  it("signs and verifies a relayed agent message", async () => {
    process.env.AGENT_BRIDGE_PRIVATE_KEY =
      "0x59c6995e998f97a5a0044966f0945382dbd4f1f1ef6aefcff4b11aab3e4b8f75";
    process.env.AGENT_BRIDGE_REQUIRE_SIGNATURE = "true";

    const message: AgentMessage = {
      id: "evt-1",
      from: "coordinator",
      to: "nounirl",
      topic: "trade-candidate",
      payload: {
        symbol: "NOUN",
        signalSource: "scanner-threshold",
      },
      timestamp: 1_700_000_000_000,
    };
    const now = Date.now();

    const signed = await signBridgeMessage({
      message,
      origin: "https://pooter.world",
      audience: "https://noun.wtf",
      relayTimestampMs: now,
    });

    expect(signed).not.toBeNull();
    process.env.AGENT_BRIDGE_ALLOWED_SIGNERS = signed!.signer;

    const headers = new Headers({
      "x-agent-bridge-version": signed!.version,
      "x-agent-bridge-signer": signed!.signer,
      "x-agent-bridge-signature": signed!.signature,
      "x-agent-bridge-origin": signed!.origin,
      "x-agent-bridge-audience": signed!.audience,
      "x-agent-bridge-timestamp": String(now),
    });

    const result = await verifyBridgeMessage({
      message,
      headers,
      expectedAudience: "https://noun.wtf",
    });

    expect(result.present).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.trusted).toBe(true);
    expect(result.signer).toBe(signed!.signer);
    expect(result.reason).toBeNull();
  });

  it("rejects an audience mismatch", async () => {
    process.env.AGENT_BRIDGE_PRIVATE_KEY =
      "0x59c6995e998f97a5a0044966f0945382dbd4f1f1ef6aefcff4b11aab3e4b8f75";

    const message: AgentMessage = {
      id: "evt-2",
      from: "coordinator",
      to: "nounirl",
      topic: "research-escalation",
      payload: { reason: "contradictions-detected" },
      timestamp: 1_700_000_000_000,
    };

    const signed = await signBridgeMessage({
      message,
      origin: "https://pooter.world",
      audience: "https://noun.wtf",
      relayTimestampMs: Date.now(),
    });

    const headers = new Headers({
      "x-agent-bridge-version": signed!.version,
      "x-agent-bridge-signer": signed!.signer,
      "x-agent-bridge-signature": signed!.signature,
      "x-agent-bridge-origin": signed!.origin,
      "x-agent-bridge-audience": signed!.audience,
      "x-agent-bridge-timestamp": String(Date.now()),
    });

    const result = await verifyBridgeMessage({
      message,
      headers,
      expectedAudience: "https://elsewhere.example",
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("audience mismatch");
  });
});
