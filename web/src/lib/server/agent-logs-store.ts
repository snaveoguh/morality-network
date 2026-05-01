// Agent log buffer — capped Redis ring shared by the pooter-agent-worker and
// the web SSE endpoint. The worker pushes lines as it logs; /api/agents/logs/stream
// reads recent lines for the /bots Live Logs tab.
//
// Why Redis: worker and web run on separate Railway projects. Both already
// have UPSTASH credentials; using Postgres would require a new schema
// coordinated with the other chat's Stage 1/2 work.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const LOGS_KEY = "pooter:agent-logs";
const MAX_LOGS = 1000;
const LIST_TRIM_INDEX = MAX_LOGS - 1;

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface AgentLogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  meta?: unknown;
}

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

function makeId(ts: number): string {
  return `${ts}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Push one log entry. Fire-and-forget on the caller side; this never throws. */
export async function pushLogEntry(
  entry: Omit<AgentLogEntry, "id" | "ts"> & { ts?: number; id?: string },
): Promise<void> {
  if (!redisEnabled()) return;
  const ts = entry.ts ?? Date.now();
  const full: AgentLogEntry = {
    id: entry.id ?? makeId(ts),
    ts,
    level: entry.level,
    source: entry.source,
    message: entry.message,
    meta: entry.meta,
  };
  try {
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["LPUSH", LOGS_KEY, JSON.stringify(full)],
        ["LTRIM", LOGS_KEY, "0", String(LIST_TRIM_INDEX)],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // logging must never crash callers
  }
}

export async function pushLogEntries(
  entries: Array<Omit<AgentLogEntry, "id" | "ts"> & { ts?: number }>,
): Promise<void> {
  if (entries.length === 0 || !redisEnabled()) return;
  const commands: unknown[] = entries.map((e) => {
    const ts = e.ts ?? Date.now();
    const full: AgentLogEntry = {
      id: makeId(ts),
      ts,
      level: e.level,
      source: e.source,
      message: e.message,
      meta: e.meta,
    };
    return ["LPUSH", LOGS_KEY, JSON.stringify(full)];
  });
  commands.push(["LTRIM", LOGS_KEY, "0", String(LIST_TRIM_INDEX)]);
  try {
    await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // swallow
  }
}

export interface FetchLogsOptions {
  /** Only return entries with ts > since. */
  since?: number;
  /** Hard cap (default 200). */
  limit?: number;
}

/** Returns entries newest-first by `ts`. */
export async function fetchRecentLogs(
  options: FetchLogsOptions = {},
): Promise<AgentLogEntry[]> {
  if (!redisEnabled()) return [];
  const limit = Math.max(1, Math.min(MAX_LOGS, options.limit ?? 200));
  const since = options.since ?? 0;

  try {
    const res = await fetch(
      `${UPSTASH_URL}/lrange/${LOGS_KEY}/0/${limit - 1}`,
      {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { result?: string[] };
    if (!Array.isArray(body.result)) return [];

    const entries: AgentLogEntry[] = [];
    for (const raw of body.result) {
      try {
        const parsed = JSON.parse(raw) as AgentLogEntry;
        if (typeof parsed.ts !== "number") continue;
        if (parsed.ts <= since) continue;
        entries.push(parsed);
      } catch {
        // skip malformed entries
      }
    }
    return entries;
  } catch {
    return [];
  }
}
