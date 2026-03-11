import { randomUUID } from "node:crypto";
import { agentRegistry } from "../core/registry";
import { messageBus } from "../core/bus";
import type {
  Agent,
  AgentMessage,
  AgentSnapshot,
  AgentStatus,
  MessageHandler,
} from "../core/types";

function sanitizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

class TopicBurstWatcherAgent implements Agent {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  private readonly topic: string;
  private readonly burstSize: number;
  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private errors: string[] = [];
  private matchedCount = 0;
  private burstCount = 0;
  private unsubscribe: (() => void) | null = null;
  private lastMessageAt = 0;

  constructor(topic: string, burstSize: number) {
    this.topic = topic;
    this.burstSize = Math.max(2, Math.min(25, burstSize));
    this.id = `watch-${sanitizeTopic(topic)}`;
    this.name = `Watcher: ${topic}`;
    this.description = `Monitors "${topic}" and emits burst signals every ${this.burstSize} messages.`;
  }

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;
    this._status = "starting";
    this.startedAt = Date.now();

    const handler: MessageHandler = async (message: AgentMessage) => {
      this.matchedCount += 1;
      this.lastActivityAt = Date.now();
      this.lastMessageAt = message.timestamp;

      if (this.matchedCount % this.burstSize !== 0) return;

      this.burstCount += 1;
      try {
        await messageBus.publish({
          id: randomUUID(),
          from: this.id,
          to: "*",
          topic: "topic-burst",
          payload: {
            watchedTopic: this.topic,
            burstSize: this.burstSize,
            totalMatched: this.matchedCount,
            burstCount: this.burstCount,
            triggerMessageId: message.id,
            triggerFrom: message.from,
          },
          timestamp: Date.now(),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.errors.push(msg);
        if (this.errors.length > 10) this.errors = this.errors.slice(-10);
      }
    };

    this.unsubscribe = messageBus.subscribe(this.topic, handler);
    this._status = "running";
  }

  stop(): void {
    this._status = "stopping";
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this._status = "idle";
  }

  snapshot(): AgentSnapshot {
    const now = Date.now();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        matchedCount: this.matchedCount,
        burstCount: this.burstCount,
        burstSize: this.burstSize,
        lastMessageAt: this.lastMessageAt,
        uptimeSeconds: this.startedAt ? Math.floor((now - this.startedAt) / 1000) : 0,
      },
      errors: this.errors,
    };
  }
}

interface SpawnResult {
  id: string;
  created: boolean;
  reason?: string;
}

class AgentFactory {
  private readonly spawnedIds = new Set<string>();
  private readonly maxAgents: number;

  constructor() {
    const parsed = Number(process.env.AGENT_FACTORY_MAX || "8");
    this.maxAgents = Number.isFinite(parsed) ? Math.max(1, parsed) : 8;
  }

  spawnTopicWatcher(topic: string, requestedBy: string, burstSize = 5): SpawnResult {
    const normalized = topic.trim();
    if (!normalized) {
      return { id: "", created: false, reason: "empty-topic" };
    }

    const id = `watch-${sanitizeTopic(normalized)}`;
    if (!id || id === "watch-") {
      return { id, created: false, reason: "invalid-topic" };
    }

    if (agentRegistry.get(id)) {
      return { id, created: false, reason: "already-exists" };
    }

    if (this.spawnedIds.size >= this.maxAgents) {
      return { id, created: false, reason: "factory-limit-reached" };
    }

    const watcher = new TopicBurstWatcherAgent(normalized, burstSize);
    agentRegistry.register(watcher);
    this.spawnedIds.add(watcher.id);

    void messageBus.publish({
      id: randomUUID(),
      from: "agent-factory",
      to: "*",
      topic: "agent-spawned",
      payload: {
        id: watcher.id,
        type: "topic-watcher",
        topic: normalized,
        requestedBy,
        burstSize: Math.max(2, Math.min(25, burstSize)),
      },
      timestamp: Date.now(),
    });

    return { id: watcher.id, created: true };
  }

  listSpawnedAgentIds(): string[] {
    return Array.from(this.spawnedIds.values());
  }

  snapshot() {
    return {
      spawnedCount: this.spawnedIds.size,
      maxAgents: this.maxAgents,
      ids: this.listSpawnedAgentIds(),
    };
  }
}

export const agentFactory = new AgentFactory();
