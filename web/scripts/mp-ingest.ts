#!/usr/bin/env node
/**
 * mp-ingest.ts — MP Record ingest + link review CLI (docs/MP_RECORD_SPEC.md §5, §6).
 *
 * Usage (from web/):
 *   npm run mp:ingest -- --members 5028,5122,4366
 *   npm run mp:ingest -- --all-current
 *   npm run mp:ingest -- --members 4366 --sources interests
 *   npm run mp:ingest -- --resume <runId>
 *   npm run mp:ingest -- --members 4366 --dry-run [--report out.json]   # no DB: in-memory store
 *   npm run mp:ingest -- --list-links [--status proposed]
 *   npm run mp:ingest -- --confirm-link <id> --reviewer "<your name>" [--note "..."]
 *   npm run mp:ingest -- --reject-link <id> --reviewer "<your name>" [--note "..."]
 *
 * Writes only to DATABASE_URL. Never run against production before the
 * MP Record launch gate is closed. No AI calls anywhere.
 */

import { writeFileSync } from "node:fs";
import { createFetcher, okJson } from "../src/lib/mp-record/http";
import { INGESTABLE_SOURCES, runMpIngest } from "../src/lib/mp-record/ingest";
import { MemoryMpStore, type MpStore } from "../src/lib/mp-record/store";
import { computeAllStats } from "../src/lib/mp-record/stats";
import { currentCommonsSearchUrl, parseMemberSearchPage } from "../src/lib/mp-record/sources/members";
import type { MpSource, StoredVersion } from "../src/lib/mp-record/types";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(name);

async function allCurrentCommons(): Promise<number[]> {
  const fetcher = createFetcher();
  const ids: number[] = [];
  for (let skip = 0; skip < 2000; skip += 20) {
    const page = parseMemberSearchPage(okJson(await fetcher.get(currentCommonsSearchUrl(skip), "members")));
    ids.push(...page.memberIds);
    if (page.memberIds.length === 0 || ids.length >= page.totalResults) break;
  }
  return ids;
}

async function reviewCommands(): Promise<boolean> {
  if (!flag("--list-links") && !arg("--confirm-link") && !arg("--reject-link")) return false;
  if (!process.env.DATABASE_URL) throw new Error("link review needs DATABASE_URL");
  const { listSourceLinks, reviewSourceLink } = await import("../src/lib/db/mp-record");
  if (flag("--list-links")) {
    const status = arg("--status") as "proposed" | "confirmed" | "rejected" | undefined;
    for (const l of await listSourceLinks({ status })) {
      console.log(`${l.id}\t${l.status}\tmember ${l.memberId}\t${l.source}:${l.externalId} "${l.externalName}"\t${l.confidence}\t${l.matchMethod}\t${JSON.stringify(l.matchEvidence)}`);
    }
    return true;
  }
  const reviewer = arg("--reviewer");
  if (!reviewer) throw new Error("--reviewer \"<your name>\" is required: links are confirmed by a named human");
  const id = Number(arg("--confirm-link") ?? arg("--reject-link"));
  const decision = arg("--confirm-link") ? "confirmed" : "rejected";
  const link = await reviewSourceLink(id, decision, reviewer, arg("--note"));
  console.log(link ? `link ${id} ${decision} by ${reviewer}` : `link ${id} not found or already reviewed`);
  return true;
}

async function main() {
  if (await reviewCommands()) process.exit(0);

  const dryRun = flag("--dry-run");
  if (!dryRun && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (use --dry-run for an in-memory run)");
  }
  const resumeRunId = arg("--resume");
  const sources = (arg("--sources")?.split(",").map((s) => s.trim()) ?? INGESTABLE_SOURCES) as MpSource[];
  let memberIds: number[] | undefined;
  if (!resumeRunId) {
    memberIds = flag("--all-current")
      ? await allCurrentCommons()
      : (arg("--members") ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
    if (memberIds.length === 0) throw new Error("pass --members <ids>, --all-current or --resume <runId>");
  }

  let store: MpStore;
  if (dryRun) {
    store = new MemoryMpStore();
  } else {
    const { PgMpStore } = await import("../src/lib/db/mp-record");
    store = new PgMpStore();
  }
  const fetcher = createFetcher({ recordRaw: (raw) => store.recordRawFetch(raw) });
  console.log(`[mp-ingest] ${dryRun ? "DRY RUN (in-memory)" : "writing to DATABASE_URL"} sources=${sources.join(",")} members=${memberIds?.length ?? "(resume)"}`);
  const report = await runMpIngest({ store, fetcher, memberIds, sources, resumeRunId, log: console.log });
  console.log(`[mp-ingest] run ${report.runId}: ${report.status}${report.errors.length ? `\n  ${report.errors.join("\n  ")}` : ""}`);

  if (dryRun && store instanceof MemoryMpStore) {
    const asOf = new Date().toISOString().slice(0, 10);
    const summary: Record<string, unknown> = {};
    for (const id of Object.keys(report.outcomes).map(Number)) {
      const name = (await store.memberDisplayName(id)) ?? String(id);
      const stats = computeAllStats(
        {
          memberId: id,
          memberName: name,
          interests: store.tableRows("mp_interests").filter((r) => r.scopeKey === `member:${id}`) as StoredVersion<"mp_interests">[],
          donations: [],
          ecLinks: [],
          checks: store.checks,
          claims: [],
        },
        asOf,
        "https://pooter.world",
      );
      summary[id] = {
        name,
        outcomes: report.outcomes[id],
        proposedLinks: store.links.filter((l) => l.memberId === id),
        stats: stats.map((s) => ({ id: s.id, headline: s.headline, breakdown: s.breakdown, notes: s.notes, available: s.available, citation: s.citation })),
      };
      console.log(`\n${name} (${id})`);
      for (const s of stats) console.log(`  ${s.id}: ${s.headline}${s.available ? "" : ` (${s.unavailableReason})`}`);
    }
    const out = arg("--report");
    if (out) writeFileSync(out, `${JSON.stringify({ asOf, runId: report.runId, members: summary, rawFetches: store.rawFetches.length }, null, 1)}\n`);
  }
  process.exit(report.status === "completed" ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
