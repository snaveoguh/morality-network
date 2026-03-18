import { setInterval } from "node:timers";
import { fetchAllFeeds, DEFAULT_FEEDS } from "../lib/rss";
import { runResearchSwarm } from "../lib/agent-swarm";
import { signBridgeMessage } from "../lib/agents/core/bridge-signature";
import { getTraderExecutionMode } from "../lib/runtime-mode";
import {
  getTraderPerformanceByRunner,
  getTraderReadinessByRunner,
  listTraderPositionsByRunner,
  redactedConfigSummary,
  runTraderCycles,
} from "../lib/trading/engine";
import { getTraderConfig, getScalperConfig } from "../lib/trading/config";
import { ScalperManager } from "../lib/trading/scalper";

type WorkerTaskName = "scanner" | "swarm" | "trader" | "bridge";
type PersistedAgentEvent = {
  id: string;
  from: string;
  to: string | "*";
  topic: string;
  payload: unknown;
  meta?: unknown;
  timestamp: number;
};

const DEFAULT_TASKS: WorkerTaskName[] = ["scanner", "swarm"];
const VALID_TASKS = new Set<WorkerTaskName>(["scanner", "swarm", "trader", "bridge"]);
const runningTasks = new Set<WorkerTaskName>();

function log(message: string, meta?: unknown): void {
  if (meta === undefined) {
    console.log(`[Worker] ${message}`);
    return;
  }
  console.log(`[Worker] ${message}`, meta);
}

function parseIntegerEnv(key: string, fallback: number, minValue = 1): number {
  const raw = process.env[key];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minValue, Math.floor(parsed));
}

function boolFromEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}

function getIndexerBaseUrl(): string {
  const raw =
    process.env.INDEXER_BACKEND_URL ||
    process.env.ARCHIVE_BACKEND_URL ||
    process.env.SCANNER_BACKEND_URL ||
    "";
  const normalized = raw.trim().replace(/\/$/, "");
  if (!normalized) {
    throw new Error("Missing INDEXER_BACKEND_URL for worker persistence");
  }
  return normalized;
}

function buildAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }
  return headers;
}

function getEnabledTasks(): WorkerTaskName[] {
  const raw = process.env.WORKER_TASKS?.trim();
  if (!raw) {
    const defaults = [...DEFAULT_TASKS];
    if (process.env.AGENT_BRIDGE_URL?.trim()) {
      defaults.push("bridge");
    }
    return defaults;
  }

  const parsed = raw
    .split(",")
    .map((task) => task.trim().toLowerCase())
    .filter((task): task is WorkerTaskName => VALID_TASKS.has(task as WorkerTaskName));

  return parsed.length > 0 ? parsed : DEFAULT_TASKS;
}

async function postIndexer(path: string, body: unknown): Promise<void> {
  const baseUrl = getIndexerBaseUrl();
  const response = await fetch(new URL(path, `${baseUrl}/`).toString(), {
    method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(parseIntegerEnv("WORKER_BACKEND_TIMEOUT_MS", 20_000)),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`${path} ${response.status}${payload ? `: ${payload.slice(0, 240)}` : ""}`);
  }
}

async function fetchIndexerJson<T>(path: string): Promise<T> {
  const baseUrl = getIndexerBaseUrl();
  const response = await fetch(new URL(path, `${baseUrl}/`).toString(), {
    method: "GET",
    headers: buildAuthHeaders(),
    signal: AbortSignal.timeout(parseIntegerEnv("WORKER_BACKEND_TIMEOUT_MS", 20_000)),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`${path} ${response.status}${payload ? `: ${payload.slice(0, 240)}` : ""}`);
  }

  return (await response.json()) as T;
}

function getBridgeTopics(): string[] {
  const raw = process.env.AGENT_BRIDGE_TOPICS?.trim();
  const topics = (raw || "trade-candidate,research-escalation,emerging-event,contradictions-detected,trade-executed,trade-closed,trader-cycle-complete")
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
  return Array.from(new Set(topics));
}

function getBridgeConsumerId(): string {
  return process.env.WORKER_BRIDGE_CONSUMER_ID?.trim() || "nounirl-bridge";
}

function getBridgeBaseUrl(): string | null {
  const value = process.env.AGENT_BRIDGE_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

function getBridgeSecret(): string {
  return process.env.AGENT_BRIDGE_SECRET?.trim() || "";
}

async function fetchBridgeCursor(consumer: string): Promise<{
  lastEventId: string | null;
  lastTimestampMs: number;
}> {
  const payload = await fetchIndexerJson<{
    cursor?: {
      lastEventId?: string | null;
      lastTimestampMs?: number;
    };
  }>(`/api/v1/agents/cursors/${encodeURIComponent(consumer)}`);

  return {
    lastEventId: payload.cursor?.lastEventId ?? null,
    lastTimestampMs: Number(payload.cursor?.lastTimestampMs ?? 0),
  };
}

async function updateBridgeCursor(
  consumer: string,
  cursor: { lastEventId: string | null; lastTimestampMs: number },
): Promise<void> {
  await fetch(new URL(`/api/v1/agents/cursors/${encodeURIComponent(consumer)}`, `${getIndexerBaseUrl()}/`).toString(), {
    method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
    headers: buildAuthHeaders(),
    body: JSON.stringify(cursor),
    signal: AbortSignal.timeout(parseIntegerEnv("WORKER_BACKEND_TIMEOUT_MS", 20_000)),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(`cursor ${response.status}${payload ? `: ${payload.slice(0, 240)}` : ""}`);
    }
  });
}

function trimBridgeBacklog(
  events: PersistedAgentEvent[],
  cursor: { lastEventId: string | null; lastTimestampMs: number },
): PersistedAgentEvent[] {
  if (cursor.lastTimestampMs <= 0) return events;

  let passedCursorEvent = cursor.lastEventId === null;
  const next: PersistedAgentEvent[] = [];

  for (const event of events) {
    if (event.timestamp < cursor.lastTimestampMs) continue;
    if (event.timestamp > cursor.lastTimestampMs) {
      passedCursorEvent = true;
      next.push(event);
      continue;
    }

    if (!passedCursorEvent) {
      if (event.id === cursor.lastEventId) {
        passedCursorEvent = true;
      }
      continue;
    }

    if (event.id !== cursor.lastEventId) {
      next.push(event);
    }
  }

  return next;
}

async function relayBridgeEvent(event: PersistedAgentEvent): Promise<void> {
  const bridgeBaseUrl = getBridgeBaseUrl();
  const bridgeSecret = getBridgeSecret();
  if (!bridgeBaseUrl || !bridgeSecret) {
    throw new Error("bridge relay requires AGENT_BRIDGE_URL and AGENT_BRIDGE_SECRET");
  }

  const bridgeUrl = new URL("/api/agents/bus/relay", `${bridgeBaseUrl}/`);
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") || getIndexerBaseUrl();
  const signature = await signBridgeMessage({
    message: {
      id: event.id,
      from: event.from,
      to: event.to,
      topic: event.topic,
      payload: event.payload,
      meta: (event.meta ?? undefined) as Record<string, unknown> | undefined,
      timestamp: event.timestamp,
    },
    origin,
    audience: bridgeUrl.origin,
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${bridgeSecret}`,
    "x-agent-origin": origin,
  };
  if (signature) {
    headers["x-agent-bridge-version"] = signature.version;
    headers["x-agent-bridge-signer"] = signature.signer;
    headers["x-agent-bridge-signature"] = signature.signature;
    headers["x-agent-bridge-origin"] = signature.origin;
    headers["x-agent-bridge-audience"] = signature.audience;
    headers["x-agent-bridge-timestamp"] = String(signature.relayTimestampMs);
  }

  const response = await fetch(bridgeUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(parseIntegerEnv("WORKER_BRIDGE_TIMEOUT_MS", 10_000)),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`bridge relay ${response.status}${payload ? `: ${payload.slice(0, 240)}` : ""}`);
  }
}

async function runScannerTask(): Promise<void> {
  const baseUrl = getIndexerBaseUrl();
  const url = new URL("/api/v1/scanner/sync", `${baseUrl}/`);
  url.searchParams.set("q", process.env.WORKER_SCANNER_QUERY?.trim() || "base");
  url.searchParams.set(
    "limit",
    String(parseIntegerEnv("WORKER_SCANNER_LIMIT", 50, 1)),
  );

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: process.env.INDEXER_WORKER_SECRET?.trim()
      ? { authorization: `Bearer ${process.env.INDEXER_WORKER_SECRET.trim()}` }
      : undefined,
    signal: AbortSignal.timeout(parseIntegerEnv("WORKER_BACKEND_TIMEOUT_MS", 20_000)),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`scanner sync ${response.status}${payload ? `: ${payload.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as { upserted?: number };
  log("scanner sync completed", { upserted: payload.upserted ?? 0 });
}

async function runSwarmTask(): Promise<void> {
  const items = await fetchAllFeeds(DEFAULT_FEEDS);
  const output = runResearchSwarm(
    items,
    parseIntegerEnv("WORKER_SWARM_CLUSTERS", 30, 1),
  );

  await postIndexer("/api/v1/swarm/latest", {
    generatedAt: output.generatedAt,
    scannedItems: output.scannedItems,
    clusters: output.clusters,
    contradictionFlags: output.contradictionFlags,
  });

  log("swarm snapshot persisted", {
    scannedItems: output.scannedItems,
    clusters: output.clusters.length,
    contradictionFlags: output.contradictionFlags.length,
  });
}

async function runTraderTask(): Promise<void> {
  if (getTraderExecutionMode() !== "worker") {
    log("trader task skipped because TRADER_EXECUTION_MODE is not worker");
    return;
  }

  const cycles = await runTraderCycles();
  const [readinessByRunner, performanceByRunner, positionsByRunner] = await Promise.all([
    getTraderReadinessByRunner(),
    getTraderPerformanceByRunner(),
    listTraderPositionsByRunner(),
  ]);

  try {
    await postIndexer("/api/v1/trading/state", {
      executionMode: "worker",
      config: redactedConfigSummary(),
      report: cycles.primary,
      parallel: cycles.parallel,
      readiness: readinessByRunner.primary,
      parallelReadiness: readinessByRunner.parallel,
      performance: performanceByRunner.primary,
      parallelPerformance: performanceByRunner.parallel,
      positions: positionsByRunner.primary,
      parallelPositions: positionsByRunner.parallel,
    });
    log("trader snapshot persisted", {
      entries: cycles.primary.entries.length,
      exits: cycles.primary.exits.length,
      errors: cycles.primary.errors.length,
      openPositions: cycles.primary.openPositions,
    });
  } catch (err) {
    log("trader state persist failed (non-fatal)", err instanceof Error ? err.message : err);
    log("trader cycle completed locally", {
      entries: cycles.primary.entries.length,
      exits: cycles.primary.exits.length,
      openPositions: cycles.primary.openPositions,
    });
  }
}

async function runBridgeTask(): Promise<void> {
  const bridgeBaseUrl = getBridgeBaseUrl();
  if (!bridgeBaseUrl) {
    log("bridge task skipped because AGENT_BRIDGE_URL is not configured");
    return;
  }

  const bridgeSecret = getBridgeSecret();
  if (!bridgeSecret) {
    log("bridge task skipped because AGENT_BRIDGE_SECRET is not configured");
    return;
  }

  const consumer = getBridgeConsumerId();
  const topics = getBridgeTopics();
  const cursor = await fetchBridgeCursor(consumer);
  const bootstrapLookbackMs = parseIntegerEnv("WORKER_BRIDGE_BOOTSTRAP_LOOKBACK_MS", 60_000, 1);
  const since = cursor.lastTimestampMs > 0
    ? Math.max(0, cursor.lastTimestampMs - 1)
    : Math.max(0, Date.now() - bootstrapLookbackMs);

  const query = new URLSearchParams();
  query.set("limit", String(parseIntegerEnv("WORKER_BRIDGE_BATCH_LIMIT", 100, 1)));
  query.set("sort", "asc");
  query.set("since", String(since));
  query.set("topic", topics.join(","));

  const payload = await fetchIndexerJson<{
    messages?: PersistedAgentEvent[];
  }>(`/api/v1/agents/events?${query.toString()}`);

  const events = trimBridgeBacklog(Array.isArray(payload.messages) ? payload.messages : [], cursor);
  if (events.length === 0) {
    log("bridge relay idle", { consumer, topics });
    return;
  }

  let relayed = 0;
  let lastDelivered: PersistedAgentEvent | null = null;
  for (const event of events) {
    await relayBridgeEvent(event);
    relayed += 1;
    lastDelivered = event;
  }

  if (lastDelivered) {
    await updateBridgeCursor(consumer, {
      lastEventId: lastDelivered.id,
      lastTimestampMs: lastDelivered.timestamp,
    });
  }

  log("bridge relay completed", {
    consumer,
    relayed,
    topics,
    lastEventId: lastDelivered?.id ?? null,
  });
}

async function executeTask(name: WorkerTaskName): Promise<boolean> {
  if (runningTasks.has(name)) {
    log(`${name} skipped because a previous run is still in flight`);
    return true;
  }

  runningTasks.add(name);
  const startedAt = Date.now();
  try {
    if (name === "scanner") {
      await runScannerTask();
    } else if (name === "swarm") {
      await runSwarmTask();
    } else if (name === "trader") {
      await runTraderTask();
    } else {
      await runBridgeTask();
    }
    log(`${name} finished`, { durationMs: Date.now() - startedAt });
    return true;
  } catch (error) {
    log(`${name} failed`, error instanceof Error ? error.message : error);
    return false;
  } finally {
    runningTasks.delete(name);
  }
}

async function runStartup(tasks: WorkerTaskName[]): Promise<boolean> {
  let success = true;
  for (const task of tasks) {
    const ok = await executeTask(task);
    if (!ok) success = false;
  }
  return success;
}

function scheduleTask(
  task: WorkerTaskName,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void executeTask(task);
  }, intervalMs);
}

async function main(): Promise<void> {
  const tasks = getEnabledTasks();
  const once = process.argv.includes("--once");
  const runOnStart = boolFromEnv("WORKER_RUN_ON_START", true);

  log("starting", {
    tasks,
    once,
    indexer: getIndexerBaseUrl(),
    traderMode: getTraderExecutionMode(),
  });

  if (runOnStart || once) {
    const success = await runStartup(tasks);
    if (once) {
      process.exit(success ? 0 : 1);
    }
  }

  const timers: Array<ReturnType<typeof setInterval>> = [];
  for (const task of tasks) {
    const intervalMs =
      task === "scanner"
        ? parseIntegerEnv("WORKER_SCANNER_INTERVAL_MS", 180_000)
        : task === "swarm"
          ? parseIntegerEnv("WORKER_SWARM_INTERVAL_MS", 300_000)
          : task === "trader"
            ? parseIntegerEnv("WORKER_TRADER_INTERVAL_MS", 120_000)
            : parseIntegerEnv("WORKER_BRIDGE_INTERVAL_MS", 10_000);
    timers.push(scheduleTask(task, intervalMs));
    log(`${task} scheduled`, { intervalMs });
  }

  // Start WebSocket-based scalper if enabled
  let scalper: ScalperManager | null = null;
  const scalperConfig = getScalperConfig();
  if (scalperConfig.enabled && getTraderExecutionMode() === "worker") {
    try {
      const traderConfig = getTraderConfig();
      if (traderConfig.executionVenue === "hyperliquid-perp") {
        scalper = new ScalperManager(traderConfig, scalperConfig);
        await scalper.start();
        log("scalper started", { markets: scalperConfig.markets, dryRun: scalperConfig.dryRun });
      } else {
        log("scalper skipped: execution venue is not hyperliquid-perp");
      }
    } catch (error) {
      log("scalper failed to start", error instanceof Error ? error.message : error);
    }
  } else if (scalperConfig.enabled) {
    log("scalper skipped: TRADER_EXECUTION_MODE is not worker");
  }

  const shutdown = async (signal: string) => {
    for (const timer of timers) {
      clearInterval(timer);
    }
    if (scalper) {
      await scalper.stop().catch(() => {});
    }
    log(`received ${signal}, shutting down`);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
  console.error("[Worker] fatal", error);
  process.exit(1);
});
