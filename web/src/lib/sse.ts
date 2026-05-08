/**
 * Reconnecting EventSource — wraps the native EventSource with exponential
 * backoff so a transient stream drop doesn't leave the UI stuck on
 * "Connecting...". Used by every SSE consumer (LiveRoom, bots console,
 * pipe stream, agent alerts).
 *
 * Behaviour:
 *  - On `error`, closes the underlying ES and schedules a reconnect with
 *    exponential backoff + 20% jitter.
 *  - Resets the attempt counter on a successful `open`.
 *  - Stops retrying after `maxRetries` (default 10) — the consumer can
 *    surface a permanent-failure state via `onError`.
 *  - `.close()` is idempotent and tears down any pending reconnect timer.
 */

export interface ReconnectingEventSource {
  /** Tear down the connection and cancel any pending reconnect attempts. */
  close: () => void;
  /** Current attempt count (0 means connected or first try). */
  getAttempt: () => number;
}

export interface ReconnectingEventSourceOptions {
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onError?: (event: Event, attempt: number, willRetry: boolean) => void;
  /** Max reconnect attempts before giving up. Default 10. */
  maxRetries?: number;
  /** Initial backoff delay in ms. Default 1000. */
  initialDelayMs?: number;
  /** Max backoff delay in ms. Default 30000 (30s). */
  maxDelayMs?: number;
  /**
   * Optional listener map for typed `event:` named SSE events (in addition
   * to the default `message` channel handled by `onMessage`).
   */
  events?: Record<string, (event: MessageEvent) => void>;
}

export function createReconnectingEventSource(
  url: string,
  options: ReconnectingEventSourceOptions = {},
): ReconnectingEventSource {
  const {
    onMessage,
    onOpen,
    onError,
    maxRetries = 10,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    events,
  } = options;

  let es: EventSource | null = null;
  let attempt = 0;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;
    try {
      es = new EventSource(url);
    } catch (err) {
      // Synchronous construction failure — schedule a retry.
      console.warn("[sse] EventSource construction failed:", err);
      scheduleReconnect();
      return;
    }

    es.onopen = () => {
      attempt = 0;
      onOpen?.();
    };

    if (onMessage) es.onmessage = onMessage;

    if (events) {
      for (const [name, handler] of Object.entries(events)) {
        es.addEventListener(name, handler as EventListener);
      }
    }

    es.onerror = (event) => {
      // EventSource auto-reconnects in some browsers, but the behaviour is
      // inconsistent and silent — close it and own the lifecycle ourselves.
      es?.close();
      es = null;

      const willRetry = !closed && attempt < maxRetries;
      onError?.(event, attempt, willRetry);

      if (!willRetry) return;
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    const base = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
    const jitter = base * 0.2 * Math.random();
    const delay = base + jitter;
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      es?.close();
      es = null;
    },
    getAttempt: () => attempt,
  };
}
