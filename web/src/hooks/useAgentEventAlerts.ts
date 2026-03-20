"use client";

import { useEffect, useRef } from "react";
import { useNotification } from "@/providers/NotificationProvider";

/**
 * Connects to the existing agent events SSE stream and maps
 * relevant events (trade, scanner.alert, error) to notifications.
 *
 * Only fires on topics we care about — ignores heartbeats and routine events.
 */

const SSE_URL = "/api/agents/events/stream?topic=trade,scanner.alert,error&pollMs=10000&limit=5";
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

export function useAgentEventAlerts() {
  const { push } = useNotification();
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectDelay = RECONNECT_BASE_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    function connect() {
      if (!mounted) return;

      es = new EventSource(SSE_URL);

      es.onopen = () => {
        reconnectDelay = RECONNECT_BASE_MS; // Reset backoff on success
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Skip heartbeats and connected messages
          if (data.type === "heartbeat" || data.type === "connected") return;

          const agentEvent = data.event;
          if (!agentEvent) return;

          const topic: string = agentEvent.topic ?? "";
          const content: string =
            typeof agentEvent.content === "string"
              ? agentEvent.content
              : JSON.stringify(agentEvent.content ?? "").slice(0, 200);

          if (topic.startsWith("trade")) {
            pushRef.current({
              type: "signal",
              title: `Agent: ${agentEvent.agentId ?? "trader"}`,
              message: content.slice(0, 150),
              autoDismissMs: 8_000,
            });
          } else if (topic === "scanner.alert") {
            pushRef.current({
              type: "info",
              title: "Scanner Alert",
              message: content.slice(0, 150),
              autoDismissMs: 6_000,
            });
          } else if (topic === "error") {
            pushRef.current({
              type: "error",
              title: "Agent Error",
              message: content.slice(0, 150),
              autoDismissMs: 8_000,
            });
          }
        } catch {
          // Malformed SSE payload — skip
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;

        if (!mounted) return;

        // Exponential backoff reconnect
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
          connect();
        }, reconnectDelay);
      };
    }

    // Only connect on client side with a small delay to avoid
    // hammering the SSE endpoint on every page navigation.
    const startTimer = setTimeout(connect, 3_000);

    return () => {
      mounted = false;
      clearTimeout(startTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);
}
