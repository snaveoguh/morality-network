import { describe, expect, it } from "vitest";
import { contentHash } from "../hash";
import { diffScope, entryHistory, snapshotAsOf } from "../versioning";
import type { CurrentVersion, FactRecord, StoredVersion } from "../types";

type Rec = FactRecord<"mp_appgs">;

function rec(id: string, role: string): Rec {
  const data = { appgName: id, officerNameAsRegistered: "A N Other", officerRole: role, registerEdition: "2026-01-01" };
  return {
    table: "mp_appgs",
    scopeKey: "s",
    sourceRecordId: id,
    data,
    contentHash: contentHash(data),
    sourceUrl: "u",
    sourceApiUrl: "u",
    parserVersion: "t",
    rawFetchId: null,
  };
}
function cur(r: Rec, version: number, rowId: number, isRemoved = false): CurrentVersion {
  return { sourceRecordId: r.sourceRecordId, version, contentHash: r.contentHash, isRemoved, rowId };
}

describe("diffScope", () => {
  it("inserts new entries as version 1", () => {
    const d = diffScope([], [rec("a", "Chair"), rec("b", "Officer")], { complete: true });
    expect(d.actions.map((a) => [a.kind, a.version])).toEqual([["insert", 1], ["insert", 1]]);
  });

  it("is a no-op when nothing changed (idempotent re-run)", () => {
    const a = rec("a", "Chair");
    const d = diffScope([cur(a, 1, 10)], [a], { complete: true });
    expect(d.actions).toEqual([]);
    expect(d.unchanged).toBe(1);
  });

  it("appends a new version when content changes, keeping the old row", () => {
    const old = rec("a", "Chair");
    const d = diffScope([cur(old, 3, 10)], [rec("a", "Vice-Chair")], { complete: true });
    expect(d.actions).toHaveLength(1);
    expect(d.actions[0]).toMatchObject({ kind: "change", version: 4, previousRowId: 10 });
  });

  it("tombstones an entry absent from a COMPLETE fetch", () => {
    const a = rec("a", "Chair");
    const d = diffScope([cur(a, 1, 10)], [], { complete: true });
    expect(d.actions).toEqual([{ kind: "remove", version: 2, sourceRecordId: "a", previousRowId: 10 }]);
  });

  it("never removes on an incomplete fetch", () => {
    const a = rec("a", "Chair");
    const d = diffScope([cur(a, 1, 10)], [], { complete: false });
    expect(d.actions).toEqual([]);
    expect(d.removalsWithheld).toBe(1);
  });

  it("does not re-tombstone an entry that is already removed", () => {
    const a = rec("a", "Chair");
    expect(diffScope([cur(a, 2, 11, true)], [], { complete: true }).actions).toEqual([]);
  });

  it("restores an entry that comes back, even with identical content", () => {
    const a = rec("a", "Chair");
    const d = diffScope([cur(a, 2, 11, true)], [a], { complete: true });
    expect(d.actions[0]).toMatchObject({ kind: "restore", version: 3, previousRowId: 11 });
  });

  it("uses the highest version when given history", () => {
    const a = rec("a", "Chair");
    const d = diffScope([cur(rec("a", "Old"), 1, 1), cur(a, 2, 2)], [a], { complete: true });
    expect(d.actions).toEqual([]);
  });

  it("refuses a fetch with duplicate record ids", () => {
    expect(() => diffScope([], [rec("a", "x"), rec("a", "y")], { complete: true })).toThrow(/duplicate/);
  });

  it("orders actions deterministically", () => {
    const d = diffScope([], [rec("c", "x"), rec("a", "x"), rec("b", "x")], { complete: true });
    expect(d.actions.map((a) => (a.kind === "remove" ? a.sourceRecordId : a.record.sourceRecordId))).toEqual(["a", "b", "c"]);
  });
});

describe("snapshotAsOf / entryHistory", () => {
  const base = rec("a", "Chair");
  const v = (version: number, at: string, role: string, isRemoved = false): StoredVersion<"mp_appgs"> => ({
    ...rec("a", role),
    rowId: version,
    version,
    retrievedAt: at,
    isRemoved,
  });
  const history = [
    v(1, "2026-01-01T10:00:00Z", "Chair"),
    v(2, "2026-03-01T10:00:00Z", "Vice-Chair"),
    v(3, "2026-05-01T10:00:00Z", "Vice-Chair", true),
  ];

  it("reconstructs the register as it stood on any date", () => {
    expect(snapshotAsOf(history, new Date("2025-12-31T23:59:59Z"))).toEqual([]);
    expect(snapshotAsOf(history, new Date("2026-02-01T00:00:00Z"))[0].data.officerRole).toBe("Chair");
    expect(snapshotAsOf(history, new Date("2026-04-01T00:00:00Z"))[0].data.officerRole).toBe("Vice-Chair");
    expect(snapshotAsOf(history, new Date("2026-06-01T00:00:00Z"))).toEqual([]);
    expect(base.sourceRecordId).toBe("a");
  });

  it("tells when an entry appeared, changed and left", () => {
    expect(entryHistory(history, "s", "a").map((h) => h.event)).toEqual(["appeared", "changed", "removed"]);
    const back = [...history, v(4, "2026-07-01T10:00:00Z", "Vice-Chair")];
    expect(entryHistory(back, "s", "a").map((h) => h.event).at(-1)).toBe("reappeared");
  });
});
