// ─── Agent Core — Message Bus ──────────────────────────────────────────────
//
// In-memory pub/sub with optional HTTP bridges for cross-site relay.

import type { AgentMessage, MessageHandler } from "./types";

interface BridgeConfig {
  url: string;
  secret: string;
}

class MessageBus {
  private subscribers = new Map<string, Set<MessageHandler<unknown>>>();
  private directSubscribers = new Map<string, Set<MessageHandler<unknown>>>();
  private messageLog: AgentMessage[] = [];
  private bridges: BridgeConfig[] = [];
  private readonly MAX_LOG_SIZE = 200;

  /** Subscribe to a topic ("*" receives all) */
  subscribe<T = unknown>(topic: string, handler: MessageHandler<T>): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(handler as MessageHandler<unknown>);
    return () => {
      this.subscribers.get(topic)?.delete(handler as MessageHandler<unknown>);
    };
  }

  /** Subscribe to messages directed at a specific agent id */
  subscribeDirect<T = unknown>(agentId: string, handler: MessageHandler<T>): () => void {
    if (!this.directSubscribers.has(agentId)) {
      this.directSubscribers.set(agentId, new Set());
    }
    this.directSubscribers.get(agentId)!.add(handler as MessageHandler<unknown>);
    return () => {
      this.directSubscribers.get(agentId)?.delete(handler as MessageHandler<unknown>);
    };
  }

  /** Register a remote bridge endpoint */
  addBridge(url: string, secret: string): void {
    // Dedupe by URL
    if (this.bridges.some((b) => b.url === url)) return;
    this.bridges.push({ url, secret });
    console.log(`[AgentBus] Bridge registered: ${url}`);
  }

  /** Publish a message to local subscribers + remote bridges */
  async publish<T = unknown>(message: AgentMessage<T>): Promise<void> {
    // Log
    this.messageLog.push(message as AgentMessage);
    if (this.messageLog.length > this.MAX_LOG_SIZE) {
      this.messageLog = this.messageLog.slice(-this.MAX_LOG_SIZE);
    }

    // Collect all matching handlers
    const topicHandlers = this.subscribers.get(message.topic) ?? new Set();
    const wildcardHandlers = this.subscribers.get("*") ?? new Set();
    const directHandlers =
      message.to !== "*"
        ? this.directSubscribers.get(message.to) ?? new Set()
        : new Set<MessageHandler<unknown>>();

    const allHandlers = new Set([...topicHandlers, ...wildcardHandlers, ...directHandlers]);

    // Fire local handlers (catch errors, never block)
    for (const handler of allHandlers) {
      try {
        await handler(message as AgentMessage<unknown>);
      } catch (err) {
        console.error(`[AgentBus] Handler error on "${message.topic}":`, err);
      }
    }

    // Forward to remote bridges (skip if message was bridged in)
    if (!message._bridged && this.bridges.length > 0) {
      for (const bridge of this.bridges) {
        this.relay(bridge, message).catch((err) => {
          console.error(`[AgentBus] Bridge relay to ${bridge.url} failed:`, err);
        });
      }
    }
  }

  /** Get recent messages for debug API */
  recentMessages(limit = 50): AgentMessage[] {
    return this.messageLog.slice(-limit);
  }

  /** Clear all subscriptions */
  clear(): void {
    this.subscribers.clear();
    this.directSubscribers.clear();
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async relay(bridge: BridgeConfig, message: AgentMessage): Promise<void> {
    const relayUrl = `${bridge.url.replace(/\/$/, "")}/api/agents/bus/relay`;
    try {
      const res = await fetch(relayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bridge.secret}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        console.warn(`[AgentBus] Bridge relay ${res.status}: ${await res.text().catch(() => "")}`);
      }
    } catch {
      // Fire-and-forget — don't crash the bus
    }
  }
}

/** Singleton shared across all agents in this process */
export const messageBus = new MessageBus();

// Auto-register bridge from env vars
const bridgeUrl = process.env.AGENT_BRIDGE_URL;
const bridgeSecret = process.env.AGENT_BRIDGE_SECRET;
if (bridgeUrl && bridgeSecret) {
  messageBus.addBridge(bridgeUrl, bridgeSecret);
}
