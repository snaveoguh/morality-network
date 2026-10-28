// Append-only versioning (MP_RECORD_SPEC §4.4). Pure: given the current
// versions in one scope and a fresh fetch of that scope, decide which rows to
// append. Never mutates anything; the store appends what this returns.

import type { CurrentVersion, FactRecord, MpFactTable, StoredVersion } from "./types";

export type VersionAction<T extends MpFactTable = MpFactTable> =
  | { kind: "insert"; version: 1; record: FactRecord<T> }
  | { kind: "change"; version: number; record: FactRecord<T>; previousRowId: number }
  | { kind: "restore"; version: number; record: FactRecord<T>; previousRowId: number }
  | { kind: "remove"; version: number; sourceRecordId: string; previousRowId: number };

export interface ScopeDiff<T extends MpFactTable = MpFactTable> {
  actions: VersionAction<T>[];
  unchanged: number;
  /** Absent entries NOT tombstoned because the fetch was incomplete. */
  removalsWithheld: number;
}

/**
 * @param current  latest version of every entry ever seen in this scope
 * @param fresh    every record in this fetch of the scope
 * @param complete true only when every page returned 2xx and the record count
 *                 matched the source's own total. Without it nothing is removed.
 */
export function diffScope<T extends MpFactTable>(
  current: CurrentVersion[],
  fresh: FactRecord<T>[],
  opts: { complete: boolean },
): ScopeDiff<T> {
  const freshById = new Map<string, FactRecord<T>>();
  for (const r of fresh) {
    if (freshById.has(r.sourceRecordId)) {
      throw new Error(`diffScope: duplicate source_record_id ${r.sourceRecordId} in ${r.scopeKey}`);
    }
    freshById.set(r.sourceRecordId, r);
  }
  const currentById = new Map<string, CurrentVersion>();
  for (const c of current) {
    const prev = currentById.get(c.sourceRecordId);
    if (!prev || c.version > prev.version) currentById.set(c.sourceRecordId, c);
  }

  const actions: VersionAction<T>[] = [];
  let unchanged = 0;
  let removalsWithheld = 0;

  // Deterministic order: by source_record_id.
  const ids = [...new Set([...freshById.keys(), ...currentById.keys()])].sort();
  for (const id of ids) {
    const rec = freshById.get(id);
    const cur = currentById.get(id);
    if (rec && !cur) {
      actions.push({ kind: "insert", version: 1, record: rec });
    } else if (rec && cur) {
      if (cur.isRemoved) {
        actions.push({ kind: "restore", version: cur.version + 1, record: rec, previousRowId: cur.rowId });
      } else if (cur.contentHash !== rec.contentHash) {
        actions.push({ kind: "change", version: cur.version + 1, record: rec, previousRowId: cur.rowId });
      } else {
        unchanged += 1;
      }
    } else if (!rec && cur && !cur.isRemoved) {
      if (opts.complete) {
        actions.push({ kind: "remove", version: cur.version + 1, sourceRecordId: id, previousRowId: cur.rowId });
      } else {
        removalsWithheld += 1;
      }
    }
  }
  return { actions, unchanged, removalsWithheld };
}

/**
 * Reconstruct the register as it stood at `asOf` (inclusive): for each entry,
 * the latest version retrieved at or before asOf, minus tombstones. This is
 * what makes stat permalinks reproducible.
 */
export function snapshotAsOf<T extends MpFactTable>(
  versions: StoredVersion<T>[],
  asOf: Date,
): StoredVersion<T>[] {
  const cutoff = asOf.getTime();
  const latest = new Map<string, StoredVersion<T>>();
  for (const v of versions) {
    if (Date.parse(v.retrievedAt) > cutoff) continue;
    const key = `${v.scopeKey}\u0000${v.sourceRecordId}`;
    const prev = latest.get(key);
    if (!prev || v.version > prev.version) latest.set(key, v);
  }
  return [...latest.values()]
    .filter((v) => !v.isRemoved)
    .sort((a, b) => (a.sourceRecordId < b.sourceRecordId ? -1 : a.sourceRecordId > b.sourceRecordId ? 1 : 0));
}

/** History of one entry, oldest first — "when it appeared, changed, left". */
export function entryHistory<T extends MpFactTable>(
  versions: StoredVersion<T>[],
  scopeKey: string,
  sourceRecordId: string,
): Array<{ version: number; retrievedAt: string; event: "appeared" | "changed" | "removed" | "reappeared" }> {
  const rows = versions
    .filter((v) => v.scopeKey === scopeKey && v.sourceRecordId === sourceRecordId)
    .sort((a, b) => a.version - b.version);
  return rows.map((v, i) => {
    const prev = rows[i - 1];
    const event = v.isRemoved
      ? "removed"
      : !prev
        ? "appeared"
        : prev.isRemoved
          ? "reappeared"
          : "changed";
    return { version: v.version, retrievedAt: v.retrievedAt, event };
  });
}
