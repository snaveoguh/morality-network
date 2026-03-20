// ─── Agent Core — Message Bus ──────────────────────────────────────────────
//
// In-memory pub/sub with optional HTTP bridges for cross-site relay.

import type { AgentMessage, MessageHandler } from "./types";
import { signBridgeMessage } from "./bridge-signature";
import { hasIndexerBackend } from "../../server/indexer-backend";
import { reportWarn } from "../../report-error";
import {
  publishPersistedAgentEvents,
  type PersistedAgentEvent,
} from "../../server/runtime-backend";

interface BridgeConfig {
  url: string;
  secret: string;
}

const PERSIST_BATCH_SIZE = 25;
const PERSIST_FLUSH_DELAY_MS = 250;
const PERSIST_RETRY_DELAY_MS = 2_000;
const MAX_PENDING_PERSISTED_MESSAGES = 500;

class MessageBus {
  private subscribers = new Map<string, Set<MessageHandler<unknown>>>();
  private directSubscribers = new Map<string, Set<MessageHandler<unknown>>>();
  private messageLog: AgentMessage[] = [];
  private bridges: BridgeConfig[] = [];
  private persistQueue = new Map<string, PersistedAgentEvent>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistInFlight = false;
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
    this.queuePersistence(message as AgentMessage);

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
    this.persistQueue.clear();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistInFlight = false;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private queuePersistence(message: AgentMessage): void {
    if (!hasIndexerBackend()) return;

    this.persistQueue.set(message.id, {
      id: message.id,
      from: message.from,
      to: message.to,
      topic: message.topic,
      payload: message.payload,
      meta: message.meta,
      source: message._bridged ? "bridge-relay" : "request-runtime",
      timestamp: message.timestamp,
      persistedAt: Date.now(),
    });

    while (this.persistQueue.size > MAX_PENDING_PERSISTED_MESSAGES) {
      const oldestQueuedId = this.persistQueue.keys().next().value;
      if (!oldestQueuedId) break;
      this.persistQueue.delete(oldestQueuedId);
    }

    if (this.persistQueue.size >= PERSIST_BATCH_SIZE) {
      this.schedulePersistenceFlush(0);
      return;
    }

    this.schedulePersistenceFlush(PERSIST_FLUSH_DELAY_MS);
  }

  private schedulePersistenceFlush(delayMs: number): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushPersistenceQueue();
    }, delayMs);
  }

  private async flushPersistenceQueue(): Promise<void> {
    if (this.persistInFlight || this.persistQueue.size === 0 || !hasIndexerBackend()) {
      return;
    }

    this.persistInFlight = true;
    let shouldRetry = false;

    try {
      while (this.persistQueue.size > 0) {
        const batchEntries = Array.from(this.persistQueue.entries()).slice(0, PERSIST_BATCH_SIZE);
        if (batchEntries.length === 0) break;

        const groupedBySource = new Map<string, Array<[string, PersistedAgentEvent]>>();
        for (const entry of batchEntries) {
          const source = entry[1].source ?? "request-runtime";
          const group = groupedBySource.get(source) ?? [];
          group.push(entry);
          groupedBySource.set(source, group);
        }

        let batchFailed = false;

        for (const [source, entries] of groupedBySource.entries()) {
          try {
            await publishPersistedAgentEvents(
              entries.map(([, event]) => event),
              source,
            );
            for (const [id] of entries) {
              this.persistQueue.delete(id);
            }
          } catch (error) {
            batchFailed = true;
            shouldRetry = true;
            console.error("[AgentBus] Failed to persist message history:", error);
            break;
          }
        }

        if (batchFailed) {
          break;
        }
      }
    } finally {
      this.persistInFlight = false;
      if (this.persistQueue.size > 0) {
        this.schedulePersistenceFlush(
          shouldRetry ? PERSIST_RETRY_DELAY_MS : PERSIST_FLUSH_DELAY_MS,
        );
      }
    }
  }

  private async relay(bridge: BridgeConfig, message: AgentMessage): Promise<void> {
    const relayUrl = `${bridge.url.replace(/\/$/, "")}/api/agents/bus/relay`;
    try {
      const signature = await signBridgeMessage({
        message,
        origin:
          process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") ||
          "http://localhost:3000",
        audience: new URL(relayUrl).origin,
      });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bridge.secret}`,
      };
      if (signature) {
        headers["x-agent-bridge-version"] = signature.version;
        headers["x-agent-bridge-signer"] = signature.signer;
        headers["x-agent-bridge-signature"] = signature.signature;
        headers["x-agent-bridge-origin"] = signature.origin;
        headers["x-agent-bridge-audience"] = signature.audience;
        headers["x-agent-bridge-timestamp"] = String(signature.relayTimestampMs);
      }

      const res = await fetch(relayUrl, {
        method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        console.warn(`[AgentBus] Bridge relay ${res.status}: ${await res.text().catch(() => "")}`);
      }
    } catch (e) {
      reportWarn("agent-bus:relay", e);
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
