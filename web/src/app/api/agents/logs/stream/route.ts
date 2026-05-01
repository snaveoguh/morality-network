import { NextRequest } from "next/server";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import {
  fetchRecentLogs,
  type AgentLogEntry,
} from "@/lib/server/agent-logs-store";

export const dynamic = "force-dynamic";

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  minValue = 1,
): number {
  if (value === null || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minValue, Math.floor(parsed));
}

export async function GET(request: NextRequest) {
  const unauthorized = await verifyOperatorAuth(request);
  if (unauthorized) return unauthorized;

  const pollMs = parsePositiveInteger(
    request.nextUrl.searchParams.get("pollMs"),
    2000,
    500,
  );
  const limit = Math.min(
    parsePositiveInteger(request.nextUrl.searchParams.get("limit"), 200),
    1000,
  );
  const historyMs = parsePositiveInteger(
    request.nextUrl.searchParams.get("historyMs"),
    5 * 60 * 1000,
    1000,
  );

  let lastTs = parsePositiveInteger(
    request.nextUrl.searchParams.get("since"),
    Date.now() - historyMs,
    0,
  );
  const seenIds = new Set<string>();
  let closed = false;
  let polling = false;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const pull = async (): Promise<AgentLogEntry[]> => {
        // Pull a window slightly older than lastTs so we don't miss late
        // arrivals from clock skew between worker and web.
        const since = Math.max(0, lastTs - 250);
        const entries = await fetchRecentLogs({ since, limit });
        // Newest-first from store; reverse so we emit chronologically and
        // keep `lastTs` monotonic.
        return entries.slice().reverse();
      };

      const poll = async () => {
        if (polling || closed) return;
        polling = true;
        try {
          const entries = await pull();
          for (const entry of entries) {
            if (seenIds.has(entry.id)) continue;
            seenIds.add(entry.id);
            if (entry.ts > lastTs) lastTs = entry.ts;
            write({ type: "log", entry });
          }
          // Trim seenIds occasionally so it doesn't grow unbounded.
          if (seenIds.size > 4000) {
            seenIds.clear();
          }
          write({ type: "heartbeat", timestamp: Date.now() });
        } catch (err) {
          write({
            type: "error",
            message: err instanceof Error ? err.message : "log stream poll failed",
          });
        } finally {
          polling = false;
        }
      };

      write({ type: "connected", since: lastTs });
      await poll();

      const interval = setInterval(() => {
        void poll();
      }, pollMs);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
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
