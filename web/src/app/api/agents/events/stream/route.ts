import { NextRequest } from "next/server";
import { messageBus } from "@/lib/agents/core";
import { isWorkerAgentRuntime } from "@/lib/runtime-mode";
import { fetchPersistedAgentEvents, type PersistedAgentEvent } from "@/lib/server/runtime-backend";

export const dynamic = "force-dynamic";

function parsePositiveInteger(value: string | null, fallback: number, minValue = 1): number {
  if (value === null || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minValue, Math.floor(parsed));
}

function parseTopics(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}

function normalizeEvent(message: PersistedAgentEvent): PersistedAgentEvent {
  return {
    ...message,
    persistedAt: message.persistedAt ?? Date.now(),
  };
}

function filterLocalMessages(
  topics: string[],
  since: number,
  limit: number,
): PersistedAgentEvent[] {
  const allowed = topics.length > 0 ? new Set(topics) : null;
  return messageBus
    .recentMessages(Math.max(limit, 200))
    .filter((message) => message.timestamp >= since)
    .filter((message) => !allowed || allowed.has(message.topic))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit)
    .map((message) =>
      normalizeEvent({
        id: message.id,
        from: message.from,
        to: message.to,
        topic: message.topic,
        payload: message.payload,
        meta: message.meta,
        source: message._bridged ? "bridge-relay" : "request-runtime",
        timestamp: message.timestamp,
        persistedAt: Date.now(),
      }),
    );
}

export async function GET(request: NextRequest) {
  const topics = parseTopics(request.nextUrl.searchParams.get("topic"));
  const pollMs = parsePositiveInteger(request.nextUrl.searchParams.get("pollMs"), 3000, 500);
  const limit = Math.min(parsePositiveInteger(request.nextUrl.searchParams.get("limit"), 50), 200);
  const historyMs = parsePositiveInteger(
    request.nextUrl.searchParams.get("historyMs"),
    5 * 60 * 1000,
    1000,
  );
  let lastTimestamp = parsePositiveInteger(
    request.nextUrl.searchParams.get("since"),
    Date.now() - historyMs,
    0,
  );
  let lastEventId: string | null = null;
  let closed = false;
  let polling = false;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const shouldEmit = (event: PersistedAgentEvent): boolean => {
        if (event.timestamp > lastTimestamp) return true;
        if (event.timestamp < lastTimestamp) return false;
        return event.id !== lastEventId;
      };

      const pullEvents = async (): Promise<PersistedAgentEvent[]> => {
        if (isWorkerAgentRuntime()) {
          const payload = await fetchPersistedAgentEvents({
            limit,
            topic: topics,
            since: Math.max(0, lastTimestamp - 1),
          });
          return payload.messages
            .slice()
            .reverse()
            .map((message) => normalizeEvent(message));
        }

        return filterLocalMessages(topics, Math.max(0, lastTimestamp - 1), limit);
      };

      const poll = async () => {
        if (polling || closed) return;
        polling = true;
        try {
          const events = await pullEvents();
          for (const event of events) {
            if (!shouldEmit(event)) continue;
            write({ type: "event", event });
            lastTimestamp = event.timestamp;
            lastEventId = event.id;
          }
          write({ type: "heartbeat", timestamp: Date.now() });
        } catch (error) {
          write({
            type: "error",
            message: error instanceof Error ? error.message : "event stream poll failed",
          });
        } finally {
          polling = false;
        }
      };

      write({
        type: "connected",
        mode: isWorkerAgentRuntime() ? "worker" : "request",
        topics,
        since: lastTimestamp,
      });

      await poll();

      const interval = setInterval(() => {
        void poll();
      }, pollMs);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
