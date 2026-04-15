/**
 * pooter1 bridge — publishes events to the agent message bus.
 * Compatible with the existing AgentMessage protocol used by
 * the web app's worker bridge, nounirl, and other agents.
 */
import { AGENT_NAME } from "./config.js";

const BRIDGE_URL = process.env.AGENT_BRIDGE_URL || "";
const BRIDGE_SECRET = process.env.AGENT_BRIDGE_SECRET || "";

interface BridgeMessage {
  from: string;
  to: string;
  topic: string;
  payload: unknown;
  timestamp: number;
  id: string;
}

function makeId(): string {
  return `${AGENT_NAME}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Publish a message to the agent bridge.
 * Topics pooter1 publishes:
 *   - editorial-published: when pooter1 writes a new editorial
 *   - entity-rated: when pooter1 rates an entity on-chain
 *   - entity-commented: when pooter1 comments on an entity
 *   - voice-updated: when the voice profile evolves
 *   - emerging-event: when pooter1 detects something noteworthy
 */
export async function publishToBridge(
  topic: string,
  payload: unknown,
  to = "*",
): Promise<boolean> {
  if (!BRIDGE_URL) {
    console.log(`[pooter1:bridge] No AGENT_BRIDGE_URL — skipping publish for ${topic}`);
    return false;
  }

  const message: BridgeMessage = {
    id: makeId(),
    from: AGENT_NAME,
    to,
    topic,
    payload,
    timestamp: Date.now(),
  };

  try {
    const res = await fetch(`${BRIDGE_URL}/api/agents/bus/relay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BRIDGE_SECRET ? { Authorization: `Bearer ${BRIDGE_SECRET}` } : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[pooter1:bridge] Relay failed ${res.status} for topic=${topic}`);
      return false;
    }

    console.log(`[pooter1:bridge] Published ${topic} → ${to}`);
    return true;
  } catch (err: any) {
    console.warn(`[pooter1:bridge] Relay error for ${topic}: ${err.message}`);
    return false;
  }
}

// Convenience methods for common events
export const bridge = {
  editorialPublished: (data: { title: string; entityHash: string; url?: string }) =>
    publishToBridge("editorial-published", data),

  entityRated: (data: { identifier: string; score: number; reason: string; txHash?: string }) =>
    publishToBridge("entity-rated", data),

  entityCommented: (data: { identifier: string; comment: string; txHash?: string }) =>
    publishToBridge("entity-commented", data),

  voiceUpdated: (data: { version: number; tone: string; style: string }) =>
    publishToBridge("voice-updated", data),

  emergingEvent: (data: { headline: string; sources: string[]; urgency: "low" | "medium" | "high" }) =>
    publishToBridge("emerging-event", data),

  deliberationCompleted: (data: { symbol: string; position: string; argumentQuality: number; id: string }) =>
    publishToBridge("deliberation-completed", data),

  editorialPositionTaken: (data: { title: string; position: string; falsifiableAt: string; entityHash: string }) =>
    publishToBridge("editorial-position-taken", data),
};
