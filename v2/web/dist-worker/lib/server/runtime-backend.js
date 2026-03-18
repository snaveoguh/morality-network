"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPersistedSwarmState = fetchPersistedSwarmState;
exports.fetchPersistedTraderState = fetchPersistedTraderState;
exports.fetchPersistedAgentEvents = fetchPersistedAgentEvents;
exports.fetchPersistedAgentCursor = fetchPersistedAgentCursor;
exports.publishPersistedAgentEvents = publishPersistedAgentEvents;
exports.publishPersistedAgentEvent = publishPersistedAgentEvent;
require("server-only");
const indexer_backend_1 = require("./indexer-backend");
function normalizeTimestampMs(value) {
    return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}
async function fetchPersistedSwarmState() {
    const state = await (0, indexer_backend_1.fetchIndexerJson)("/api/v1/swarm/latest");
    return {
        ...state,
        updatedAt: normalizeTimestampMs(state.updatedAt),
    };
}
async function fetchPersistedTraderState() {
    const state = await (0, indexer_backend_1.fetchIndexerJson)("/api/v1/trading/state");
    return {
        ...state,
        updatedAt: normalizeTimestampMs(state.updatedAt),
    };
}
async function fetchPersistedAgentEvents(query = {}) {
    const searchParams = new URLSearchParams();
    if (query.limit !== undefined)
        searchParams.set("limit", String(query.limit));
    if (query.since !== undefined)
        searchParams.set("since", String(Math.max(0, Math.floor(query.since))));
    if (query.cursor !== undefined)
        searchParams.set("cursor", String(Math.max(0, Math.floor(query.cursor))));
    if (query.from)
        searchParams.set("from", query.from);
    if (query.to)
        searchParams.set("to", query.to);
    if (query.sort)
        searchParams.set("sort", query.sort);
    const topics = Array.isArray(query.topic) ? query.topic : query.topic ? [query.topic] : [];
    if (topics.length > 0) {
        searchParams.set("topic", topics.join(","));
    }
    const suffix = searchParams.toString();
    const payload = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/agents/events${suffix ? `?${suffix}` : ""}`);
    return {
        ...payload,
        messages: payload.messages.map((message) => ({
            ...message,
            timestamp: normalizeTimestampMs(message.timestamp),
            persistedAt: message.persistedAt === undefined ? undefined : normalizeTimestampMs(message.persistedAt),
        })),
    };
}
async function fetchPersistedAgentCursor(consumer) {
    const payload = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/agents/cursors/${encodeURIComponent(consumer)}`);
    return {
        ...payload.cursor,
        lastTimestampMs: normalizeTimestampMs(payload.cursor.lastTimestampMs),
        updatedAt: normalizeTimestampMs(payload.cursor.updatedAt),
    };
}
async function publishPersistedAgentEvents(messages, source = "web-runtime") {
    const baseUrl = (0, indexer_backend_1.getIndexerBackendUrl)();
    if (!baseUrl) {
        throw new Error("Indexer backend URL is not configured");
    }
    const headers = {
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
    return (await response.json());
}
async function publishPersistedAgentEvent(message, source = "web-runtime") {
    return publishPersistedAgentEvents([message], source);
}
