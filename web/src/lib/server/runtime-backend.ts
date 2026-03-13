import "server-only";

import type {
  AgentContradictionFlag,
  EmergingEventCluster,
} from "@/lib/agent-swarm";
import type {
  Position,
  TraderCycleReport,
  TraderPerformanceReport,
  TraderReadinessReport,
} from "@/lib/trading/types";
import { fetchIndexerJson, getIndexerBackendUrl } from "./indexer-backend";

export interface PersistedSwarmState {
  generatedAt: string;
  scannedItems: number;
  clusters: EmergingEventCluster[];
  contradictionFlags: AgentContradictionFlag[];
  updatedAt: number;
}

export interface PersistedTraderState {
  executionMode: string;
  config: unknown;
  report: TraderCycleReport | null;
  parallel: Array<{ runnerId: string; label: string; report: TraderCycleReport }>;
  readiness: TraderReadinessReport | null;
  parallelReadiness: Array<{ runnerId: string; label: string; readiness: TraderReadinessReport }>;
  performance: TraderPerformanceReport | null;
  parallelPerformance: Array<{ runnerId: string; label: string; performance: TraderPerformanceReport }>;
  positions: Position[];
  parallelPositions: Array<{ runnerId: string; label: string; positions: Position[] }>;
  updatedAt: number;
}

export interface PersistedAgentEventMeta {
  sender?: {
    address?: string | null;
    ens?: string | null;
  };
  humanPrompt?: boolean;
  promptText?: string | null;
  promptPreview?: string | null;
  relayedFrom?: string | null;
  receivedAt?: number;
  bridge?: {
    present?: boolean;
    verified?: boolean;
    trusted?: boolean;
    signer?: string | null;
    claimedSigner?: string | null;
    signature?: string | null;
    origin?: string | null;
    audience?: string | null;
    relayTimestampMs?: number | null;
    relayAgeMs?: number | null;
    version?: string | null;
    reason?: string | null;
  };
}

export interface PersistedAgentEvent {
  id: string;
  from: string;
  to: string | "*";
  topic: string;
  payload: unknown;
  meta?: PersistedAgentEventMeta;
  source?: string;
  timestamp: number;
  persistedAt?: number;
}

export interface PersistedAgentEventQuery {
  limit?: number;
  topic?: string | string[];
  from?: string;
  to?: string;
  since?: number;
  cursor?: number;
  sort?: "asc" | "desc";
}

export interface PersistedAgentCursor {
  id: string;
  consumer: string;
  lastEventId: string | null;
  lastTimestampMs: number;
  updatedAt: number;
}

function normalizeTimestampMs(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

export async function fetchPersistedSwarmState(): Promise<PersistedSwarmState> {
  const state = await fetchIndexerJson<PersistedSwarmState>("/api/v1/swarm/latest");
  return {
    ...state,
    updatedAt: normalizeTimestampMs(state.updatedAt),
  };
}

export async function fetchPersistedTraderState(): Promise<PersistedTraderState> {
  const state = await fetchIndexerJson<PersistedTraderState>("/api/v1/trading/state");
  return {
    ...state,
    updatedAt: normalizeTimestampMs(state.updatedAt),
  };
}

export async function fetchPersistedAgentEvents(
  query: PersistedAgentEventQuery = {},
): Promise<{ messages: PersistedAgentEvent[]; count: number; meta?: Record<string, unknown> }> {
  const searchParams = new URLSearchParams();
  if (query.limit !== undefined) searchParams.set("limit", String(query.limit));
  if (query.since !== undefined) searchParams.set("since", String(Math.max(0, Math.floor(query.since))));
  if (query.cursor !== undefined) searchParams.set("cursor", String(Math.max(0, Math.floor(query.cursor))));
  if (query.from) searchParams.set("from", query.from);
  if (query.to) searchParams.set("to", query.to);
  if (query.sort) searchParams.set("sort", query.sort);

  const topics = Array.isArray(query.topic) ? query.topic : query.topic ? [query.topic] : [];
  if (topics.length > 0) {
    searchParams.set("topic", topics.join(","));
  }

  const suffix = searchParams.toString();
  const payload = await fetchIndexerJson<{
    messages: PersistedAgentEvent[];
    count: number;
    meta?: Record<string, unknown>;
  }>(
    `/api/v1/agents/events${suffix ? `?${suffix}` : ""}`,
  );
  return {
    ...payload,
    messages: payload.messages.map((message) => ({
      ...message,
      timestamp: normalizeTimestampMs(message.timestamp),
      persistedAt:
        message.persistedAt === undefined ? undefined : normalizeTimestampMs(message.persistedAt),
    })),
  };
}

export async function fetchPersistedAgentCursor(consumer: string): Promise<PersistedAgentCursor> {
  const payload = await fetchIndexerJson<{ cursor: PersistedAgentCursor }>(
    `/api/v1/agents/cursors/${encodeURIComponent(consumer)}`,
  );
  return {
    ...payload.cursor,
    lastTimestampMs: normalizeTimestampMs(payload.cursor.lastTimestampMs),
    updatedAt: normalizeTimestampMs(payload.cursor.updatedAt),
  };
}

export async function publishPersistedAgentEvents(
  messages: PersistedAgentEvent[],
  source = "web-runtime",
): Promise<{ ok: true; count: number; messages: PersistedAgentEvent[] }> {
  const baseUrl = getIndexerBackendUrl();
  if (!baseUrl) {
    throw new Error("Indexer backend URL is not configured");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(new URL("/api/v1/agents/events", `${baseUrl}/`).toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ source, messages }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return (await response.json()) as { ok: true; count: number; messages: PersistedAgentEvent[] };
}

export async function publishPersistedAgentEvent(
  message: PersistedAgentEvent,
  source = "web-runtime",
): Promise<{ ok: true; count: number; messages: PersistedAgentEvent[] }> {
  return publishPersistedAgentEvents([message], source);
}
