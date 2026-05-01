import { NextRequest, NextResponse } from "next/server";
import { pushLogEntries, type LogLevel } from "@/lib/server/agent-logs-store";

export const dynamic = "force-dynamic";

interface IngestPayload {
  entries?: Array<{
    ts?: number;
    level?: string;
    source?: string;
    message?: string;
    meta?: unknown;
  }>;
}

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set([
  "info",
  "warn",
  "error",
  "debug",
]);

function isValidLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && VALID_LEVELS.has(value as LogLevel);
}

function authorize(request: NextRequest): boolean {
  const expected = process.env.INDEXER_WORKER_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token === expected;
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  const sanitized = payload.entries
    .filter((e) => typeof e.message === "string" && e.message.length > 0)
    .map((e) => ({
      ts: typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : Date.now(),
      level: isValidLevel(e.level) ? e.level : ("info" as LogLevel),
      source: typeof e.source === "string" && e.source ? e.source : "worker",
      message: (e.message as string).slice(0, 4000),
      meta: e.meta,
    }))
    .slice(0, 200);

  await pushLogEntries(sanitized);
  return NextResponse.json({ accepted: sanitized.length });
}
