import { NextResponse } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { getAIBudgetWindowHours } from "@/lib/ai-budget";
import { type AIProviderId } from "@/lib/ai-models";
import { messageBus } from "@/lib/agents/core";
import { bridgeSignatureIsRequired } from "@/lib/agents/core/bridge-signature";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import {
  fetchAIUsageSummary,
  getAIProviderBudgetState,
} from "@/lib/server/ai-telemetry";
import { fetchIndexerJson, hasIndexerBackend } from "@/lib/server/indexer-backend";
import {
  fetchPersistedAgentCursor,
  fetchPersistedAgentEvents,
  type PersistedAgentEvent,
} from "@/lib/server/runtime-backend";

export const dynamic = "force-dynamic";

type AgentEventSummaryResponse = {
  window: {
    since: number;
    until: number;
    windowMs: number;
    minutes: number;
  };
  totals: {
    events: number;
    throughputPerMinute: number;
    latestEventAt: number | null;
  };
  topics: Array<{
    topic: string;
    count: number;
    throughputPerMinute: number;
    lastSeenAt: number;
    lastFrom: string;
    lastTo: string;
  }>;
};

function parseWindowMs(request: Request): number {
  const { searchParams } = new URL(request.url);
  const parsed = Number(searchParams.get("windowMs") || "900000");
  if (!Number.isFinite(parsed)) return 15 * 60 * 1000;
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Math.floor(parsed)));
}

function getBridgeTopics(): string[] {
  const raw =
    process.env.AGENT_BRIDGE_TOPICS?.trim() ||
    "trade-candidate,research-escalation,emerging-event,contradictions-detected,trade-executed,trade-closed,trader-cycle-complete";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((topic) => topic.trim())
        .filter((topic) => topic.length > 0),
    ),
  );
}

function getBridgeConsumerId(): string {
  return process.env.WORKER_BRIDGE_CONSUMER_ID?.trim() || "nounirl-bridge";
}

function getAllowedSignerCount(): number {
  const raw = process.env.AGENT_BRIDGE_ALLOWED_SIGNERS?.trim();
  if (!raw) return 0;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0).length;
}

function summarizeLocalMessages(messages: PersistedAgentEvent[], windowMs: number): AgentEventSummaryResponse {
  const since = Date.now() - windowMs;
  const rows = messages.filter((message) => message.timestamp >= since);
  const topicMap = new Map<
    string,
    { count: number; lastSeenAt: number; lastFrom: string; lastTo: string }
  >();

  for (const row of rows) {
    const existing = topicMap.get(row.topic) ?? {
      count: 0,
      lastSeenAt: row.timestamp,
      lastFrom: row.from,
      lastTo: row.to,
    };
    existing.count += 1;
    if (row.timestamp >= existing.lastSeenAt) {
      existing.lastSeenAt = row.timestamp;
      existing.lastFrom = row.from;
      existing.lastTo = row.to;
    }
    topicMap.set(row.topic, existing);
  }

  const minutes = Math.max(1, Math.round(windowMs / 60_000));
  return {
    window: {
      since,
      until: Date.now(),
      windowMs,
      minutes,
    },
    totals: {
      events: rows.length,
      throughputPerMinute: Number((rows.length / minutes).toFixed(2)),
      latestEventAt: rows.length > 0 ? Math.max(...rows.map((row) => row.timestamp)) : null,
    },
    topics: Array.from(topicMap.entries())
      .map(([topic, summary]) => ({
        topic,
        count: summary.count,
        throughputPerMinute: Number((summary.count / minutes).toFixed(2)),
        lastSeenAt: summary.lastSeenAt,
        lastFrom: summary.lastFrom,
        lastTo: summary.lastTo,
      }))
      .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt),
  };
}

function summarizeTraderDecision(event: PersistedAgentEvent) {
  const payload = event.payload && typeof event.payload === "object"
    ? (event.payload as Record<string, unknown>)
    : {};

  const readNumber = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };

  const readText = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return null;
  };

  return {
    id: event.id,
    topic: event.topic,
    timestamp: event.timestamp,
    market:
      readText("symbol", "market", "asset", "baseAsset", "pair", "positionId") ||
      readText("tokenAddress") ||
      "unknown",
    side: readText("side", "direction"),
    sizeUsd: readNumber("sizeUsd", "notionalUsd", "amountUsd"),
    pnlUsd: readNumber("pnlUsd", "realizedPnlUsd", "realizedPnl"),
    executionVenue: readText("executionVenue"),
    reason: readText("reason", "signalSource"),
    dryRun: typeof payload.dryRun === "boolean" ? payload.dryRun : null,
    payload,
  };
}

function defaultBudgetState(provider: AIProviderId, windowHours: number) {
  return {
    provider,
    windowHours,
    totalUsd: null,
    providerUsd: null,
    totalSpentUsd: 0,
    providerSpentUsd: 0,
    totalRemainingUsd: null,
    providerRemainingUsd: null,
    totalExceeded: false,
    providerExceeded: false,
    allowed: true,
  };
}

export async function GET(request: Request) {
  try {
    const unauthorized = await verifyOperatorAuth(request);
    if (unauthorized) return unauthorized;

    const windowMs = parseWindowMs(request);
    const now = Date.now();
    const bridgeTopics = getBridgeTopics();
    const decisionTopics = ["trade-executed", "trade-closed", "trader-cycle-complete"];
    const workerMode = isWorkerAgentRuntime();

    let summary: AgentEventSummaryResponse = summarizeLocalMessages(
      messageBus.recentMessages(200).map((message) => ({
        id: message.id,
        from: message.from,
        to: message.to,
        topic: message.topic,
        payload: message.payload,
        meta: message.meta,
        timestamp: message.timestamp,
        source: message._bridged ? "bridge-relay" : "request-runtime",
        persistedAt: Date.now(),
      })),
      windowMs,
    );
    let bridgeCursor = null as Awaited<ReturnType<typeof fetchPersistedAgentCursor>> | null;
    let bridgePendingSummary = null as AgentEventSummaryResponse | null;
    let recentDecisions: PersistedAgentEvent[] = [];

    if (hasIndexerBackend()) {
      try {
        summary = await fetchIndexerJson<AgentEventSummaryResponse>(
          `/api/v1/agents/events/summary?windowMs=${windowMs}`,
        );
      } catch (error) {
        console.warn("[API /agents/console] Event summary unavailable, using local fallback:", error);
      }

      try {
        recentDecisions = (
          await fetchPersistedAgentEvents({
            limit: 20,
            topic: decisionTopics,
            since: now - windowMs,
          })
        ).messages;
      } catch (error) {
        console.warn(
          "[API /agents/console] Persisted trader decisions unavailable, using local fallback:",
          error,
        );
      }

      if (workerMode && process.env.AGENT_BRIDGE_URL?.trim()) {
        try {
          bridgeCursor = await fetchPersistedAgentCursor(getBridgeConsumerId());
          bridgePendingSummary = await fetchIndexerJson<AgentEventSummaryResponse>(
            `/api/v1/agents/events/summary?since=${Math.max(
              0,
              bridgeCursor.lastTimestampMs,
            )}&topic=${encodeURIComponent(bridgeTopics.join(","))}`,
          );
        } catch (error) {
          bridgeCursor = null;
          bridgePendingSummary = null;
          console.warn("[API /agents/console] Bridge backlog unavailable:", error);
        }
      }
    } else {
      recentDecisions = [];
    }

    if (recentDecisions.length === 0) {
      recentDecisions = messageBus
        .recentMessages(100)
        .filter((message) => decisionTopics.includes(message.topic))
        .map((message) => ({
          id: message.id,
          from: message.from,
          to: message.to,
          topic: message.topic,
          payload: message.payload,
          meta: message.meta,
          timestamp: message.timestamp,
          source: message._bridged ? "bridge-relay" : "request-runtime",
          persistedAt: Date.now(),
        }))
        .slice(0, 20);
    }

    const aiWindowHours = getAIBudgetWindowHours();
    let aiSummary = null as Awaited<ReturnType<typeof fetchAIUsageSummary>>;
    try {
      aiSummary = await fetchAIUsageSummary({ hours: aiWindowHours });
    } catch (error) {
      console.warn("[API /agents/console] AI telemetry unavailable:", error);
      aiSummary = null;
    }
    const providerIds: AIProviderId[] = ["anthropic", "openai", "venice", "ollama"];
    const providerBudgets = await Promise.all(
      providerIds.map(async (provider) => ({
        provider,
        budget: aiSummary
          ? await getAIProviderBudgetState(provider).catch((error) => {
              console.warn(
                `[API /agents/console] AI budget unavailable for ${provider}:`,
                error,
              );
              return null;
            })
          : null,
      })),
    );

    const relayEvents = (
      await fetchPersistedAgentEvents({
        limit: 50,
        since: now - windowMs,
        topic: bridgeTopics,
      }).catch(() => ({ messages: [] as PersistedAgentEvent[], count: 0 }))
    ).messages;

    const verifiedRelayCount = relayEvents.filter((event) => event.meta?.bridge?.verified).length;
    const trustedRelayCount = relayEvents.filter((event) => event.meta?.bridge?.trusted).length;
    const signerSet = new Set(
      relayEvents
        .map((event) => event.meta?.bridge?.signer)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    return NextResponse.json({
      generatedAt: now,
      mode: workerMode ? "worker" : "request",
      throughput: summary,
      bridge: {
        configured: Boolean(process.env.AGENT_BRIDGE_URL?.trim()),
        consumer: getBridgeConsumerId(),
        topics: bridgeTopics,
        cursor: bridgeCursor,
        latestTopicEventAt: bridgePendingSummary?.totals.latestEventAt ?? null,
        lagMs:
          bridgeCursor && bridgePendingSummary?.totals.latestEventAt
            ? Math.max(0, bridgePendingSummary.totals.latestEventAt - bridgeCursor.lastTimestampMs)
            : null,
        pendingEvents: bridgePendingSummary?.totals.events ?? 0,
        verifiedRelayCount,
        trustedRelayCount,
        uniqueSigners: Array.from(signerSet),
        signature: {
          required: bridgeSignatureIsRequired(),
          allowlistedSigners: getAllowedSignerCount(),
        },
      },
      trader: {
        decisions: recentDecisions
          .sort((a, b) => b.timestamp - a.timestamp)
          .map((event) => summarizeTraderDecision(event)),
      },
      ai: {
        windowHours: aiWindowHours,
        summary: aiSummary,
        budgets: providerBudgets.map((entry) => ({
          provider: entry.provider,
          ...(entry.budget ?? defaultBudgetState(entry.provider, aiWindowHours)),
        })),
      },
    });
  } catch (error) {
    console.error("[API /agents/console] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load swarm console" },
      { status: 500 },
    );
  }
}
