// Fixture-based ingest: the real orchestrator, parsers, differ and in-memory
// store, with HTTP served from captured register responses.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFetcher } from "../http";
import { runMpIngest } from "../ingest";
import { MemoryMpStore } from "../store";
import { computeStat, type StatInputs } from "../stats";
import { biographyApiUrl, memberApiUrl } from "../sources/members";
import { interestsPageUrl } from "../sources/interests";
import { ecCsvUrl, ecTotalUrl } from "../sources/electoral-commission";
import type { StoredVersion } from "../types";

const fx = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

function routes(overrides: Record<string, string | { status: number; body: string }> = {}) {
  const base: Record<string, string> = {
    [memberApiUrl(4366)]: fx("member-4366.json"),
    [biographyApiUrl(4366)]: fx("biography-4366.json"),
    [interestsPageUrl(4366, 0)]: fx("interests-4366-p0.json"),
    [ecTotalUrl("James Cleverly")]: fx("ec-total-4366.json"),
    [ecCsvUrl("James Cleverly", 35)]: fx("ec-4366.csv"),
  };
  return { ...base, ...overrides };
}

function fakeFetch(table: Record<string, string | { status: number; body: string }>, calls: string[] = []) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const hit = table[url];
    if (hit === undefined) return new Response("not found", { status: 404 });
    const { status, body } = typeof hit === "string" ? { status: 200, body: hit } : hit;
    return new Response(body, { status, headers: { "content-type": url.includes("/csv/") ? "text/csv" : "application/json" } });
  }) as typeof fetch;
}

function makeFetcher(store: MemoryMpStore, table: Record<string, string | { status: number; body: string }>, calls?: string[]) {
  return createFetcher({
    recordRaw: (raw) => store.recordRawFetch(raw),
    fetchImpl: fakeFetch(table, calls),
    minIntervalMs: 0,
    sleep: async () => {},
  });
}

function interestsWithout(id: number): string {
  const page = JSON.parse(fx("interests-4366-p0.json"));
  page.items = page.items.filter((i: { id: number }) => i.id !== id);
  page.totalResults = page.items.length;
  return JSON.stringify(page);
}

describe("runMpIngest (fixtures)", () => {
  it("ingests members, interests and EC with provenance and stores every raw body", async () => {
    const store = new MemoryMpStore();
    const report = await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366], runId: "r1" });
    expect(report.errors).toEqual([]);
    expect(report.status).toBe("completed");
    expect(report.outcomes[4366].members).toMatchObject({ status: "ok", inserted: 21 });
    expect(report.outcomes[4366].interests).toMatchObject({ status: "ok", inserted: 11, complete: true });
    expect(report.outcomes[4366].electoral_commission).toMatchObject({ status: "ok", inserted: 35, linkProposalsNew: 1 });

    expect(store.rawFetches).toHaveLength(5);
    const interests = store.tableRows("mp_interests");
    expect(interests.every((r) => r.rawFetchId !== null && r.contentHash.length === 64 && r.retrievedAt)).toBe(true);
    // the EC link is only a proposal: nothing about donations is public yet
    expect(store.links).toHaveLength(1);
    expect(store.links[0].status).toBe("proposed");
    expect(store.checks.map((c) => `${c.source}:${c.scopeKey}`).sort()).toEqual([
      "electoral_commission:ec-entity:2863",
      "interests:member:4366",
      "members:member:4366",
    ]);
  });

  it("is idempotent: a second run appends nothing", async () => {
    const store = new MemoryMpStore();
    await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366] });
    const before = store.tableRows("mp_interests").length + store.tableRows("mp_donations").length;
    const report = await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366] });
    expect(report.outcomes[4366].interests).toMatchObject({ inserted: 0, changed: 0, removed: 0, unchanged: 11 });
    expect(store.tableRows("mp_interests").length + store.tableRows("mp_donations").length).toBe(before);
    expect(store.links).toHaveLength(1);
    expect(store.rawFetches.every((r) => r.seenCount === 2)).toBe(true); // identical bodies stored once
  });

  it("records a change as a new version and a disappearance as a tombstone", async () => {
    const store = new MemoryMpStore();
    await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366], sources: ["interests"] });

    const page = JSON.parse(interestsWithout(13352));
    const misc = page.items.find((i: { id: number }) => i.id === 1387);
    misc.summary = `${misc.summary} (amended)`;
    const report = await runMpIngest({
      store,
      fetcher: makeFetcher(store, routes({ [interestsPageUrl(4366, 0)]: JSON.stringify(page) })),
      memberIds: [4366],
      sources: ["interests"],
    });
    expect(report.outcomes[4366].interests).toMatchObject({ changed: 1, removed: 1 });

    const rows = store.tableRows("mp_interests") as StoredVersion<"mp_interests">[];
    const v1387 = rows.filter((r) => r.sourceRecordId === "1387").sort((a, b) => a.version - b.version);
    expect(v1387.map((r) => [r.version, r.data.summary?.endsWith("(amended)")])).toEqual([[1, false], [2, true]]);
    const v13352 = rows.filter((r) => r.sourceRecordId === "13352").sort((a, b) => a.version - b.version);
    expect(v13352.map((r) => [r.version, r.isRemoved])).toEqual([[1, false], [2, true]]);
    expect(v13352[1].data.summary).toBe(v13352[0].data.summary); // tombstone keeps what was there
  });

  it("withholds removals when the fetch is incomplete", async () => {
    const store = new MemoryMpStore();
    await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366], sources: ["interests"] });
    // The API claims 5 entries but returns 4: incomplete.
    const page = JSON.parse(interestsWithout(13352));
    page.totalResults = 5;
    const report = await runMpIngest({
      store,
      fetcher: makeFetcher(store, routes({ [interestsPageUrl(4366, 0)]: JSON.stringify(page), [interestsPageUrl(4366, 20)]: JSON.stringify({ ...page, items: [], skip: 20 }) })),
      memberIds: [4366],
      sources: ["interests"],
    });
    expect(report.status).toBe("failed");
    expect(report.outcomes[4366].interests).toMatchObject({ status: "error", removed: 0, removalsWithheld: 1, complete: false });
    expect(store.tableRows("mp_interests").some((r) => r.isRemoved)).toBe(false);
    expect(store.checks.filter((c) => c.source === "interests")).toHaveLength(1); // no check for the bad fetch
  });

  it("refuses a truncated EC export rather than tombstoning donations", async () => {
    const store = new MemoryMpStore();
    await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366] });
    const lines = fx("ec-4366.csv").split("\n");
    const truncated = lines.slice(0, 10).join("\n") + "\n";
    const report = await runMpIngest({
      store,
      fetcher: makeFetcher(store, routes({ [ecCsvUrl("James Cleverly", 35)]: truncated })),
      memberIds: [4366],
      sources: ["electoral_commission"],
    });
    expect(report.outcomes[4366].electoral_commission).toMatchObject({ status: "error", complete: false, removed: 0 });
    expect(store.tableRows("mp_donations").some((r) => r.isRemoved)).toBe(false);
  });

  it("resumes a failed run, skipping what was done", async () => {
    const store = new MemoryMpStore();
    const broken = routes({ [interestsPageUrl(4366, 0)]: { status: 500, body: "boom" } });
    const first = await runMpIngest({ store, fetcher: makeFetcher(store, broken), memberIds: [4366], runId: "r-resume" });
    expect(first.status).toBe("failed");
    expect(first.outcomes[4366].members?.status).toBe("ok");

    const calls: string[] = [];
    const second = await runMpIngest({ store, fetcher: makeFetcher(store, routes(), calls), resumeRunId: "r-resume" });
    expect(second.status).toBe("completed");
    expect(second.outcomes[4366].members?.status).toBe("skipped");
    expect(second.outcomes[4366].interests?.status).toBe("ok");
    expect(calls.some((u) => u.includes("members-api") && !u.includes("Biography"))).toBe(false);
    expect((await store.getRun("r-resume"))?.cursor.done.sort()).toEqual([
      "4366:electoral_commission",
      "4366:interests",
      "4366:members",
    ]);
  });

  it("feeds reproducible stats; EC figures need a confirmed link", async () => {
    const store = new MemoryMpStore();
    await runMpIngest({ store, fetcher: makeFetcher(store, routes()), memberIds: [4366] });
    // Pin retrieval times so the as-of logic is deterministic in the test.
    for (const t of ["mp_interests", "mp_donations"] as const) {
      for (const r of store.tableRows(t)) r.retrievedAt = "2026-10-28T12:00:00.000Z";
    }
    for (const c of store.checks) c.checkedAt = "2026-10-28T12:00:00.000Z";

    const inputs = (): StatInputs => ({
      memberId: 4366,
      memberName: "Sir James Cleverly",
      interests: store.tableRows("mp_interests") as StoredVersion<"mp_interests">[],
      donations: store.tableRows("mp_donations") as StoredVersion<"mp_donations">[],
      ecLinks: store.links.filter((l) => l.status === "confirmed").map((l) => ({ externalId: l.externalId, reviewedAt: l.reviewedAt! })),
      checks: store.checks,
      claims: [],
    });

    const s12 = computeStat("interests-value-12m", inputs(), "2026-10-28", "https://pooter.world");
    expect(s12.headline).toBe("£12,750.00"); // 5,950.00 + 6,800.00 (JLA Speakers payments)
    expect(s12.notes.join(" ")).toMatch(/1 entry has no stated value/);
    expect(s12.notes.join(" ")).toMatch(/1 ongoing employment agreement/);
    const sParl = computeStat("interests-value-parliament", inputs(), "2026-10-28", "https://pooter.world");
    expect(sParl.headline).toBe("£43,350.00");

    const before = computeStat("donations-ec-12m", inputs(), "2026-10-28", "https://pooter.world");
    expect(before.available).toBe(false);
    store.confirmLink(store.links[0].id, "reviewer:test", "2026-10-28T13:00:00.000Z");
    const after = computeStat("donations-ec-12m", inputs(), "2026-10-28", "https://pooter.world");
    expect(after.headline).toBe("£23,858.89");
    expect(after.rowsUsed.map((r) => r.sourceRecordId)).toEqual(["V0836181"]);
    // Confirmed after the asOf day → an earlier permalink is unchanged.
    expect(computeStat("donations-ec-12m", inputs(), "2026-10-27", "https://pooter.world").available).toBe(false);
  });

  it("rejects an LLM as link reviewer", () => {
    const store = new MemoryMpStore();
    store.links.push({
      id: 1, memberId: 1, source: "electoral_commission", externalId: "1", externalName: null, matchMethod: "llm:x",
      matchEvidence: {}, confidence: "low", proposedBy: "llm:x", status: "proposed", reviewedBy: null, reviewedAt: null,
    });
    expect(() => store.confirmLink(1, "llm:some-model", "2026-01-01T00:00:00Z")).toThrow();
  });
});

describe("createFetcher", () => {
  it("spaces requests to the same host and retries 5xx", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    let n = 0;
    const fetcher = createFetcher({
      minIntervalMs: 500,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      fetchImpl: (async () => {
        n += 1;
        return n === 1 ? new Response("busy", { status: 503 }) : new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    const a = await fetcher.get("https://example.test/a", "members");
    const b = await fetcher.get("https://example.test/b", "members");
    expect(a.ok && b.ok).toBe(true);
    expect(n).toBe(3);
    expect(sleeps.filter((ms) => ms === 500).length).toBeGreaterThanOrEqual(1);
  });
});
