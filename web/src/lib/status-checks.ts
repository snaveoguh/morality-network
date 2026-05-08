import "server-only";

import { getArchivedEditorial, getRecentPooterOriginals } from "@/lib/editorial-archive";
import { getDailyEditionHash } from "@/lib/daily-edition";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";

/**
 * Public status checks — surface whether the things that should be running
 * are actually running. Intentionally simple: each check returns a uniform
 * shape that the /status page and the /api/status JSON endpoint can render.
 *
 * Design rules:
 *  - All checks must be safe to call from a public unauthenticated context.
 *  - No secrets in detail strings.
 *  - Each check should bound its own timeout — the page shouldn't hang on
 *    one slow probe.
 *  - "ok" = working as expected; "warn" = degraded but not broken; "fail" =
 *    needs attention. The header banner takes the worst level across all.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface StatusCheck {
  name: string;
  description: string;
  status: CheckStatus;
  detail: string;
  /** When the system last did the thing being checked, if known. */
  lastActivityAt: string | null;
  /** Milliseconds since lastActivityAt — convenience for the UI. */
  ageMs: number | null;
  /** How long the check itself took, ms. */
  durationMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function ageOf(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Date.now() - t : null;
}

async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

/* ── Daily Edition ── */

async function checkDailyEdition(): Promise<StatusCheck> {
  const start = Date.now();
  const hash = getDailyEditionHash();
  const existing = await withDeadline(
    getArchivedEditorial(hash).catch(() => null),
    8000,
    null,
  );
  const durationMs = Date.now() - start;

  if (!existing) {
    return {
      name: "Daily Edition",
      description: "Today's morning front page (cron 5:30 UTC).",
      status: "fail",
      detail: "No edition cached for today's hash. Cron may not have fired or generation failed.",
      lastActivityAt: null,
      ageMs: null,
      durationMs,
    };
  }

  const lastActivityAt = existing.generatedAt;
  const ageMs = ageOf(lastActivityAt);

  return {
    name: "Daily Edition",
    description: "Today's morning front page (cron 5:30 UTC).",
    status: "ok",
    detail: existing.dailyTitle ? `"${existing.dailyTitle}" — ${existing.primary.title}` : existing.primary.title,
    lastActivityAt,
    ageMs,
    durationMs,
  };
}

/* ── Pooter Originals (newsroom cron output) ── */

async function checkOriginals(): Promise<StatusCheck> {
  const start = Date.now();
  const recent = await withDeadline(
    getRecentPooterOriginals(false, 1).catch(() => []),
    8000,
    [] as Awaited<ReturnType<typeof getRecentPooterOriginals>>,
  );
  const durationMs = Date.now() - start;

  if (recent.length === 0) {
    return {
      name: "Pooter Originals",
      description: "Newsroom-generated articles (cron 6:00 UTC, 3x daily).",
      status: "fail",
      detail: "No originals returned in the last 7 days. Newsroom cron likely down.",
      lastActivityAt: null,
      ageMs: null,
      durationMs,
    };
  }

  const top = recent[0];
  const lastActivityAt = top.generatedAt ?? null;
  const ageMs = ageOf(lastActivityAt);

  // Newsroom runs every 8h-ish — flag if last item is > 18h old
  let status: CheckStatus = "ok";
  if (ageMs !== null && ageMs > 18 * HOUR_MS) status = "warn";
  if (ageMs !== null && ageMs > 2 * DAY_MS) status = "fail";

  return {
    name: "Pooter Originals",
    description: "Newsroom-generated articles (cron 6:00 UTC, 3x daily).",
    status,
    detail: top.title ?? "(latest original)",
    lastActivityAt,
    ageMs,
    durationMs,
  };
}

/* ── Indexer health ── */

async function checkIndexer(): Promise<StatusCheck> {
  const start = Date.now();
  const baseUrl = getIndexerBackendUrl();

  if (!baseUrl) {
    return {
      name: "Indexer",
      description: "Backend article + governance archive (Railway pooter-indexer).",
      status: "fail",
      detail: "INDEXER_BACKEND_URL is not configured.",
      lastActivityAt: null,
      ageMs: null,
      durationMs: Date.now() - start,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - start;

    if (!res.ok) {
      return {
        name: "Indexer",
        description: "Backend article + governance archive (Railway pooter-indexer).",
        status: "fail",
        detail: `Health endpoint returned ${res.status}.`,
        lastActivityAt: null,
        ageMs: null,
        durationMs,
      };
    }

    return {
      name: "Indexer",
      description: "Backend article + governance archive (Railway pooter-indexer).",
      status: "ok",
      detail: `Health 200 in ${durationMs}ms.`,
      lastActivityAt: new Date().toISOString(),
      ageMs: 0,
      durationMs,
    };
  } catch (err) {
    return {
      name: "Indexer",
      description: "Backend article + governance archive (Railway pooter-indexer).",
      status: "fail",
      detail: `Unreachable: ${err instanceof Error ? err.message : "unknown error"}.`,
      lastActivityAt: null,
      ageMs: null,
      durationMs: Date.now() - start,
    };
  }
}

/* ── Agent worker telemetry ── */

async function checkAgentSnapshot(): Promise<StatusCheck> {
  const start = Date.now();
  const baseUrl = getIndexerBackendUrl();
  if (!baseUrl) {
    return {
      name: "Agent Worker",
      description: "Pooter trading + editorial agent (pooter-agent-worker).",
      status: "warn",
      detail: "Indexer URL unavailable, can't reach snapshot endpoint.",
      lastActivityAt: null,
      ageMs: null,
      durationMs: Date.now() - start,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/v1/agents/snapshot`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - start;

    if (!res.ok) {
      return {
        name: "Agent Worker",
        description: "Pooter trading + editorial agent (pooter-agent-worker).",
        status: "warn",
        detail: `Snapshot endpoint returned ${res.status}.`,
        lastActivityAt: null,
        ageMs: null,
        durationMs,
      };
    }

    const body = (await res.json()) as { lastTickAt?: string; lastSeenAt?: string; updatedAt?: string };
    const lastActivityAt = body.lastTickAt ?? body.lastSeenAt ?? body.updatedAt ?? null;
    const ageMs = ageOf(lastActivityAt);

    let status: CheckStatus = "ok";
    if (!lastActivityAt) status = "warn";
    else if (ageMs !== null && ageMs > 30 * 60 * 1000) status = "warn";
    else if (ageMs !== null && ageMs > 4 * HOUR_MS) status = "fail";

    return {
      name: "Agent Worker",
      description: "Pooter trading + editorial agent (pooter-agent-worker).",
      status,
      detail: lastActivityAt ? "Snapshot received." : "Snapshot returned no activity timestamp.",
      lastActivityAt,
      ageMs,
      durationMs,
    };
  } catch (err) {
    return {
      name: "Agent Worker",
      description: "Pooter trading + editorial agent (pooter-agent-worker).",
      status: "warn",
      detail: `Snapshot unreachable: ${err instanceof Error ? err.message : "unknown error"}.`,
      lastActivityAt: null,
      ageMs: null,
      durationMs: Date.now() - start,
    };
  }
}

/* ── Aggregator ── */

export async function runStatusChecks(): Promise<{
  overall: CheckStatus;
  generatedAt: string;
  checks: StatusCheck[];
}> {
  const checks = await Promise.all([
    checkDailyEdition(),
    checkOriginals(),
    checkIndexer(),
    checkAgentSnapshot(),
  ]);

  const ranks: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 };
  let overall: CheckStatus = "ok";
  for (const c of checks) {
    if (ranks[c.status] > ranks[overall]) overall = c.status;
  }

  return {
    overall,
    generatedAt: new Date().toISOString(),
    checks,
  };
}
