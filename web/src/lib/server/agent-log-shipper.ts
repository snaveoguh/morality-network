// Worker-side log shipper. Mirrors console output and process-level errors
// into the Redis log buffer so the /bots Live Logs tab can stream them.
// Idempotent — safe to call once at worker bootstrap.
//
// We patch the global console rather than only wrapping the worker's own log()
// so output from imported libs ("[swarm-signals] ...", "[trader] ...") also
// shows up in the live feed.

import { pushLogEntry, type LogLevel } from "./agent-logs-store";

let installed = false;

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatArgs(args: unknown[]): { message: string; meta?: unknown } {
  if (args.length === 0) return { message: "" };
  const message = args.map(safeStringify).join(" ");
  // Keep the last non-string arg as structured meta if present
  const tail = args[args.length - 1];
  if (tail && typeof tail === "object" && !(tail instanceof Error)) {
    return { message, meta: tail };
  }
  return { message };
}

function inferSource(message: string): string {
  // Lines like "[swarm-signals] something happened" → source = "swarm-signals"
  const match = message.match(/^\s*\[([^\]]+)\]/);
  return match ? match[1] : "worker";
}

function shipLine(level: LogLevel, args: unknown[]): void {
  const { message, meta } = formatArgs(args);
  if (!message) return;
  void pushLogEntry({
    level,
    source: inferSource(message),
    message: message.slice(0, 4000),
    meta,
  });
}

export function installAgentLogShipper(): void {
  if (installed) return;
  installed = true;

  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    shipLine("info", args);
  };
  console.info = (...args: unknown[]) => {
    origInfo(...args);
    shipLine("info", args);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    shipLine("warn", args);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    shipLine("error", args);
  };

  process.on("uncaughtException", (err) => {
    shipLine("error", [`[process] uncaughtException: ${err.message}`, err.stack]);
  });
  process.on("unhandledRejection", (reason) => {
    const message =
      reason instanceof Error
        ? `[process] unhandledRejection: ${reason.message}`
        : `[process] unhandledRejection: ${safeStringify(reason)}`;
    shipLine("error", [message, reason instanceof Error ? reason.stack : undefined]);
  });
}
