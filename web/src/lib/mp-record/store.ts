// Storage contract for MP Record ingest. Postgres implementation:
// lib/db/mp-record.ts. In-memory implementation (below): tests and --dry-run.
// Both append only; neither has an update or delete path for fact rows.

import type { RawFetchInput } from "./http";
import type { VersionAction } from "./versioning";
import type {
  CurrentVersion,
  MpFactTable,
  MpSource,
  SourceCheck,
  SourceLink,
  SourceLinkProposal,
  StoredVersion,
} from "./types";

export interface IngestRun {
  id: string;
  sources: MpSource[];
  params: { memberIds: number[] };
  status: "running" | "completed" | "failed";
  cursor: { done: string[] };
}

export interface AppendContext {
  retrievedAt: string;
  /** Raw fetch that showed this state (tombstones use the scope's first fetch). */
  rawFetchId: number | null;
}

export interface AppendResult {
  inserted: number;
  changed: number;
  removed: number;
}

export interface MpStore {
  recordRawFetch(raw: RawFetchInput): Promise<number | null>;
  startRun(run: Omit<IngestRun, "status" | "cursor">): Promise<void>;
  getRun(id: string): Promise<IngestRun | null>;
  saveCursor(id: string, cursor: IngestRun["cursor"]): Promise<void>;
  finishRun(id: string, status: "completed" | "failed", stats: unknown, error?: string): Promise<void>;
  currentVersions(table: MpFactTable, scopeKey: string): Promise<CurrentVersion[]>;
  appendVersions(table: MpFactTable, actions: VersionAction[], ctx: AppendContext): Promise<AppendResult>;
  recordSourceCheck(check: SourceCheck): Promise<void>;
  /** Insert proposals that do not exist yet; never touches reviewed links. Returns how many were new. */
  proposeLinks(proposals: SourceLinkProposal[]): Promise<number>;
  memberDisplayName(memberId: number): Promise<string | null>;
}

export function countActions(actions: VersionAction[]): AppendResult {
  const r: AppendResult = { inserted: 0, changed: 0, removed: 0 };
  for (const a of actions) {
    if (a.kind === "insert") r.inserted += 1;
    else if (a.kind === "remove") r.removed += 1;
    else r.changed += 1;
  }
  return r;
}

/** In-memory store with the same append-only semantics as Postgres. */
export class MemoryMpStore implements MpStore {
  rawFetches: Array<RawFetchInput & { id: number; seenCount: number }> = [];
  runs = new Map<string, IngestRun & { stats?: unknown; error?: string }>();
  versions = new Map<MpFactTable, StoredVersion[]>();
  checks: SourceCheck[] = [];
  links: SourceLink[] = [];
  private nextRowId = 1;

  async recordRawFetch(raw: RawFetchInput): Promise<number> {
    const existing = this.rawFetches.find((r) => r.url === raw.url && r.bodySha256 === raw.bodySha256);
    if (existing) {
      existing.seenCount += 1;
      return existing.id;
    }
    const id = this.rawFetches.length + 1;
    this.rawFetches.push({ ...raw, id, seenCount: 1 });
    return id;
  }

  async startRun(run: Omit<IngestRun, "status" | "cursor">): Promise<void> {
    if (!this.runs.has(run.id)) this.runs.set(run.id, { ...run, status: "running", cursor: { done: [] } });
    else this.runs.get(run.id)!.status = "running";
  }

  async getRun(id: string): Promise<IngestRun | null> {
    const r = this.runs.get(id);
    return r ? { ...r, cursor: { done: [...r.cursor.done] } } : null;
  }

  async saveCursor(id: string, cursor: IngestRun["cursor"]): Promise<void> {
    const r = this.runs.get(id);
    if (r) r.cursor = { done: [...cursor.done] };
  }

  async finishRun(id: string, status: "completed" | "failed", stats: unknown, error?: string): Promise<void> {
    const r = this.runs.get(id);
    if (r) Object.assign(r, { status, stats, error });
  }

  tableRows(table: MpFactTable): StoredVersion[] {
    if (!this.versions.has(table)) this.versions.set(table, []);
    return this.versions.get(table)!;
  }

  async currentVersions(table: MpFactTable, scopeKey: string): Promise<CurrentVersion[]> {
    const latest = new Map<string, StoredVersion>();
    for (const v of this.tableRows(table)) {
      if (v.scopeKey !== scopeKey) continue;
      const prev = latest.get(v.sourceRecordId);
      if (!prev || v.version > prev.version) latest.set(v.sourceRecordId, v);
    }
    return [...latest.values()].map((v) => ({
      sourceRecordId: v.sourceRecordId,
      version: v.version,
      contentHash: v.contentHash,
      isRemoved: v.isRemoved,
      rowId: v.rowId,
    }));
  }

  async appendVersions(table: MpFactTable, actions: VersionAction[], ctx: AppendContext): Promise<AppendResult> {
    const rows = this.tableRows(table);
    for (const a of actions) {
      const prev = a.kind === "insert" ? undefined : rows.find((r) => r.rowId === a.previousRowId);
      if (a.kind !== "insert" && !prev) throw new Error(`${a.kind}: previous row ${a.previousRowId} not found`);
      const next: StoredVersion =
        a.kind === "remove"
          ? { ...prev!, isRemoved: true, rawFetchId: ctx.rawFetchId }
          : { ...a.record, isRemoved: false, rowId: 0, version: 0, retrievedAt: "" };
      next.rowId = this.nextRowId++;
      next.version = a.version;
      next.retrievedAt = ctx.retrievedAt;
      // Same UNIQUE (scope_key, source_record_id, version) as migration 014.
      if (rows.some((r) => r.scopeKey === next.scopeKey && r.sourceRecordId === next.sourceRecordId && r.version === next.version)) {
        throw new Error(`unique violation: ${table} ${next.sourceRecordId} v${next.version} already exists`);
      }
      rows.push(next);
    }
    return countActions(actions);
  }

  async recordSourceCheck(check: SourceCheck): Promise<void> {
    this.checks.push({ ...check });
  }

  async proposeLinks(proposals: SourceLinkProposal[]): Promise<number> {
    let n = 0;
    for (const p of proposals) {
      const exists = this.links.some(
        (l) => l.source === p.source && l.externalId === p.externalId && l.memberId === p.memberId,
      );
      if (exists) continue;
      this.links.push({ ...p, id: this.links.length + 1, status: "proposed", reviewedBy: null, reviewedAt: null });
      n += 1;
    }
    return n;
  }

  /** Test/dry-run helper mirroring the CLI's human confirmation step. */
  confirmLink(id: number, reviewer: string, at: string): void {
    if (reviewer.startsWith("llm:")) throw new Error("an LLM cannot confirm a link");
    const link = this.links.find((l) => l.id === id);
    if (!link) throw new Error(`link ${id} not found`);
    Object.assign(link, { status: "confirmed", reviewedBy: reviewer, reviewedAt: at });
  }

  async memberDisplayName(memberId: number): Promise<string | null> {
    const rows = this.tableRows("mp_members").filter(
      (r) => r.scopeKey === `member:${memberId}` && !r.isRemoved,
    ) as StoredVersion<"mp_members">[];
    const latest = rows.sort((a, b) => b.version - a.version)[0];
    return latest?.data.nameDisplay ?? null;
  }
}
