import "server-only";

import path from "node:path";
import { computeEntityHash } from "./entity";
import { Store } from "./agents/core";
import { normalizeUrl } from "./evidence-verify";
import type { CanonicalSourceRecord } from "./source-registry";

export type CrawlQueueStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type CrawlTargetKind =
  | "source-home"
  | "source-feed"
  | "event-article";

export interface CrawlQueueEntry {
  id: string;
  url: string;
  kind: CrawlTargetKind;
  sourceId: string | null;
  eventId: string | null;
  priority: number;
  status: CrawlQueueStatus;
  attempts: number;
  enqueuedAt: number;
  lastAttemptAt: number | null;
  completedAt: number | null;
  lastError: string | null;
  discoveredFrom: string | null;
}

const CRAWL_QUEUE_PATH =
  process.env.CRAWL_QUEUE_PATH ||
  path.join("/tmp", "pooter-crawl-queue.json");

const LEASE_MS = 5 * 60 * 1000;

const crawlQueueStore = new Store<CrawlQueueEntry>({
  persistPath: CRAWL_QUEUE_PATH,
  maxItems: 8000,
  keyFn: (entry) => entry.id,
});

function makeQueueId(
  kind: CrawlTargetKind,
  normalizedUrl: string,
  sourceId: string | null,
  eventId: string | null,
) {
  return computeEntityHash(
    `${kind}:${sourceId || "unknown"}:${eventId || "none"}:${normalizedUrl}`
  );
}

function nowMs() {
  return Date.now();
}

function requeueExpired(entries: CrawlQueueEntry[]): CrawlQueueEntry[] {
  const now = nowMs();
  return entries.map((entry) => {
    if (
      entry.status === "processing" &&
      entry.lastAttemptAt &&
      now - entry.lastAttemptAt > LEASE_MS
    ) {
      const reset: CrawlQueueEntry = {
        ...entry,
        status: "queued",
        lastError: entry.lastError || "Lease expired before completion",
      };
      crawlQueueStore.add(reset);
      return reset;
    }
    return entry;
  });
}

export function enqueueCrawlTarget(input: {
  url: string;
  kind: CrawlTargetKind;
  sourceId?: string | null;
  eventId?: string | null;
  priority?: number;
  discoveredFrom?: string | null;
}) {
  const normalizedUrl = normalizeUrl(input.url);
  if (!normalizedUrl) return null;

  const id = makeQueueId(
    input.kind,
    normalizedUrl,
    input.sourceId ?? null,
    input.eventId ?? null
  );

  const existing = crawlQueueStore.get(id);
  const merged: CrawlQueueEntry = {
    id,
    url: normalizedUrl,
    kind: input.kind,
    sourceId: input.sourceId ?? null,
    eventId: input.eventId ?? null,
    priority: Math.max(existing?.priority ?? 0, input.priority ?? 50),
    status:
      existing?.status === "completed" ? "completed" : existing?.status ?? "queued",
    attempts: existing?.attempts ?? 0,
    enqueuedAt: existing?.enqueuedAt ?? nowMs(),
    lastAttemptAt: existing?.lastAttemptAt ?? null,
    completedAt: existing?.completedAt ?? null,
    lastError: existing?.lastError ?? null,
    discoveredFrom: input.discoveredFrom ?? existing?.discoveredFrom ?? null,
  };

  crawlQueueStore.add(merged);
  return merged;
}

export function seedCrawlQueueFromRegistry(sources: CanonicalSourceRecord[]) {
  let count = 0;
  for (const source of sources) {
    const seeds = [
      { url: source.homepageUrl, kind: "source-home" as const, priority: 35 },
      ...source.feedUrls.map((url) => ({
        url,
        kind: "source-feed" as const,
        priority: 20,
      })),
    ];

    for (const seed of seeds) {
      const added = enqueueCrawlTarget({
        url: seed.url,
        kind: seed.kind,
        sourceId: source.id,
        priority: seed.priority,
        discoveredFrom: source.name,
      });
      if (added) count++;
    }
  }
  return count;
}

export function reserveCrawlBatch(limit = 25): CrawlQueueEntry[] {
  const refreshed = requeueExpired(crawlQueueStore.getAll());
  const candidates = refreshed
    .filter((entry) => entry.status === "queued")
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    })
    .slice(0, limit);

  const leased = candidates.map((entry) => {
    const next: CrawlQueueEntry = {
      ...entry,
      status: "processing",
      attempts: entry.attempts + 1,
      lastAttemptAt: nowMs(),
    };
    crawlQueueStore.add(next);
    return next;
  });

  return leased;
}

export function completeCrawlTarget(id: string) {
  const entry = crawlQueueStore.get(id);
  if (!entry) return null;
  const next: CrawlQueueEntry = {
    ...entry,
    status: "completed",
    completedAt: nowMs(),
    lastError: null,
  };
  crawlQueueStore.add(next);
  return next;
}

export function failCrawlTarget(id: string, error: string) {
  const entry = crawlQueueStore.get(id);
  if (!entry) return null;
  const next: CrawlQueueEntry = {
    ...entry,
    status: "failed",
    lastError: error,
  };
  crawlQueueStore.add(next);
  return next;
}

export function getCrawlQueueSnapshot(limit = 100): CrawlQueueEntry[] {
  return requeueExpired(crawlQueueStore.getAll())
    .sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.enqueuedAt - a.enqueuedAt;
    })
    .slice(0, limit);
}

export function getCrawlQueueStats() {
  const items = requeueExpired(crawlQueueStore.getAll());
  const stats = {
    total: items.length,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const entry of items) {
    stats[entry.status] += 1;
  }

  return stats;
}
