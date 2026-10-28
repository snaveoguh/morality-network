// MP Record ingest orchestrator (MP_RECORD_SPEC §5).
// Idempotent (diff-based appends), rate-limited (via Fetcher), resumable
// (cursor of completed member:source pairs), auditable (raw bodies stored by
// the fetcher before parsing). No LLM anywhere in this path.

import { okJson, type Fetcher } from "./http";
import { countActions, type MpStore } from "./store";
import { diffScope } from "./versioning";
import { biographyApiUrl, memberApiUrl, memberScopeKey, parseBiography, parseMember } from "./sources/members";
import { interestsPageUrl, parseInterestsPage, INTERESTS_PAGE_SIZE } from "./sources/interests";
import {
  EC_MAX_ROWS,
  ecCsvUrl,
  ecScopeKey,
  ecSearchName,
  ecTotalUrl,
  parseEcCsv,
  parseEcTotal,
  proposeEcLinks,
} from "./sources/electoral-commission";
import type { FactRecord, MpFactTable, MpSource } from "./types";

export const INGESTABLE_SOURCES: MpSource[] = ["members", "interests", "electoral_commission"];
export const STUB_SOURCES: MpSource[] = ["companies_house", "appg"];
const SOURCE_ORDER: MpSource[] = ["members", "interests", "electoral_commission", "companies_house", "appg"];
const MAX_INTEREST_PAGES = 100;

export interface SourceOutcome {
  status: "ok" | "error" | "skipped";
  reason?: string;
  records?: number;
  inserted?: number;
  changed?: number;
  removed?: number;
  unchanged?: number;
  removalsWithheld?: number;
  complete?: boolean;
  linkProposalsNew?: number;
  unmatchedEntities?: Array<{ id: number; name: string | null }>;
}

export interface IngestReport {
  runId: string;
  status: "completed" | "failed";
  outcomes: Record<string, Partial<Record<MpSource, SourceOutcome>>>;
  errors: string[];
}

export interface IngestOptions {
  store: MpStore;
  fetcher: Fetcher;
  memberIds?: number[];
  sources?: MpSource[];
  /** Resume this run: reuse its params and skip member:source pairs already done. */
  resumeRunId?: string;
  runId?: string;
  log?: (message: string) => void;
}

interface ScopeResult {
  records: number;
  inserted: number;
  changed: number;
  removed: number;
  unchanged: number;
  removalsWithheld: number;
}

async function applyScope<T extends MpFactTable>(
  store: MpStore,
  table: T,
  scopeKey: string,
  fresh: FactRecord<T>[],
  complete: boolean,
  retrievedAt: string,
  rawFetchId: number | null,
): Promise<ScopeResult> {
  const current = await store.currentVersions(table, scopeKey);
  const diff = diffScope(current, fresh, { complete });
  if (diff.actions.length > 0) {
    await store.appendVersions(table, diff.actions, { retrievedAt, rawFetchId });
  }
  const counts = countActions(diff.actions);
  return { records: fresh.length, ...counts, unchanged: diff.unchanged, removalsWithheld: diff.removalsWithheld };
}

function sum(a: ScopeResult, b: ScopeResult): ScopeResult {
  return {
    records: a.records + b.records,
    inserted: a.inserted + b.inserted,
    changed: a.changed + b.changed,
    removed: a.removed + b.removed,
    unchanged: a.unchanged + b.unchanged,
    removalsWithheld: a.removalsWithheld + b.removalsWithheld,
  };
}

async function ingestMembersSource(
  opts: IngestOptions,
  runId: string,
  memberId: number,
  names: Map<number, string>,
): Promise<SourceOutcome> {
  const { store, fetcher } = opts;
  const memberRes = await fetcher.get(memberApiUrl(memberId), "members");
  const bioRes = await fetcher.get(biographyApiUrl(memberId), "members");
  const member = parseMember(okJson(memberRes), memberRes.rawFetchId);
  if (member.data.memberId !== memberId) {
    throw new Error(`members API returned id ${member.data.memberId} for ${memberId}`);
  }
  const periods = parseBiography(okJson(bioRes), memberId, bioRes.rawFetchId);
  if (member.data.nameDisplay) names.set(memberId, member.data.nameDisplay);

  const scope = memberScopeKey(memberId);
  const a = await applyScope(store, "mp_members", scope, [member], true, memberRes.fetchedAt, memberRes.rawFetchId);
  const b = await applyScope(store, "mp_member_periods", scope, periods, true, bioRes.fetchedAt, bioRes.rawFetchId);
  const total = sum(a, b);
  await store.recordSourceCheck({
    runId,
    source: "members",
    scopeKey: scope,
    memberId,
    checkedAt: bioRes.fetchedAt,
    nRecords: total.records,
    nInserted: total.inserted,
    nChanged: total.changed,
    nRemoved: total.removed,
    rawFetchIds: [memberRes.rawFetchId, bioRes.rawFetchId].filter((x): x is number => x !== null),
  });
  return { status: "ok", complete: true, ...total };
}

async function ingestInterestsSource(opts: IngestOptions, runId: string, memberId: number): Promise<SourceOutcome> {
  const { store, fetcher } = opts;
  const records: FactRecord<"mp_interests">[] = [];
  const rawIds: number[] = [];
  let firstFetchedAt: string | null = null;
  let topLevelSeen = 0;
  let total: number | null = null;
  let consistent = true;
  for (let page = 0; page < MAX_INTEREST_PAGES; page += 1) {
    const res = await fetcher.get(interestsPageUrl(memberId, page * INTERESTS_PAGE_SIZE), "interests");
    firstFetchedAt ??= res.fetchedAt;
    if (res.rawFetchId !== null) rawIds.push(res.rawFetchId);
    const parsed = parseInterestsPage(okJson(res), res.rawFetchId);
    if (total !== null && parsed.totalResults !== total) consistent = false; // register changed mid-fetch
    total = parsed.totalResults;
    records.push(...parsed.records);
    topLevelSeen += parsed.topLevelCount;
    if (parsed.topLevelCount === 0 || topLevelSeen >= total) break;
  }
  for (const r of records) {
    if (r.data.memberId !== memberId) throw new Error(`interest ${r.sourceRecordId} belongs to member ${r.data.memberId}, not ${memberId}`);
  }
  const complete = consistent && total !== null && topLevelSeen === total;
  const scope = memberScopeKey(memberId);
  const result = await applyScope(store, "mp_interests", scope, records, complete, firstFetchedAt!, rawIds[0] ?? null);
  if (complete) {
    await store.recordSourceCheck({
      runId,
      source: "interests",
      scopeKey: scope,
      memberId,
      checkedAt: firstFetchedAt!,
      nRecords: result.records,
      nInserted: result.inserted,
      nChanged: result.changed,
      nRemoved: result.removed,
      rawFetchIds: rawIds,
    });
  }
  return { status: complete ? "ok" : "error", reason: complete ? undefined : `incomplete: saw ${topLevelSeen} of ${total} entries`, complete, ...result };
}

async function ingestEcSource(
  opts: IngestOptions,
  runId: string,
  memberId: number,
  names: Map<number, string>,
): Promise<SourceOutcome> {
  const { store, fetcher } = opts;
  const displayName = names.get(memberId) ?? (await store.memberDisplayName(memberId));
  if (!displayName) throw new Error(`no stored name for member ${memberId}: ingest 'members' first`);
  const searchName = ecSearchName(displayName);

  const totalRes = await fetcher.get(ecTotalUrl(searchName), "electoral_commission");
  const total = parseEcTotal(okJson(totalRes));
  if (total > EC_MAX_ROWS) throw new Error(`EC search "${searchName}" has ${total} rows (> ${EC_MAX_ROWS}); refusing a truncated export`);
  const csvUrl = ecCsvUrl(searchName, Math.max(total, 1));
  const csvRes = await fetcher.get(csvUrl, "electoral_commission");
  if (!csvRes.ok) throw new Error(`HTTP ${csvRes.status} from ${csvUrl}`);
  const exp = parseEcCsv(csvRes.body, csvUrl, csvRes.rawFetchId);
  const complete = exp.totalRows === total && exp.unparseableRows === 0;

  // One scope per regulated entity. Entities absent from this export are not
  // touched: a renamed entity must not have its history tombstoned.
  const byEntity = new Map<number, FactRecord<"mp_donations">[]>();
  for (const r of exp.mpDoneeRecords) {
    const list = byEntity.get(r.data.regulatedEntityId) ?? [];
    list.push(r);
    byEntity.set(r.data.regulatedEntityId, list);
  }
  let agg: ScopeResult = { records: 0, inserted: 0, changed: 0, removed: 0, unchanged: 0, removalsWithheld: 0 };
  for (const [entityId, recs] of [...byEntity.entries()].sort((x, y) => x[0] - y[0])) {
    const scope = ecScopeKey(entityId);
    const res = await applyScope(store, "mp_donations", scope, recs, complete, csvRes.fetchedAt, csvRes.rawFetchId);
    agg = sum(agg, res);
    if (complete) {
      await store.recordSourceCheck({
        runId,
        source: "electoral_commission",
        scopeKey: scope,
        memberId: null, // EC rows reach a member only via a confirmed link
        checkedAt: csvRes.fetchedAt,
        nRecords: res.records,
        nInserted: res.inserted,
        nChanged: res.changed,
        nRemoved: res.removed,
        rawFetchIds: [totalRes.rawFetchId, csvRes.rawFetchId].filter((x): x is number => x !== null),
      });
    }
  }
  const { proposals, unmatchedEntities } = proposeEcLinks(memberId, displayName, exp.mpDoneeRecords);
  const linkProposalsNew = await store.proposeLinks(proposals);
  return {
    status: complete ? "ok" : "error",
    reason: complete ? undefined : `incomplete: export had ${exp.totalRows} rows, search total ${total}`,
    complete,
    ...agg,
    linkProposalsNew,
    unmatchedEntities,
  };
}

function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `mp-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runMpIngest(opts: IngestOptions): Promise<IngestReport> {
  const { store } = opts;
  const log = opts.log ?? (() => {});
  let runId: string;
  let memberIds: number[];
  let sources: MpSource[];
  let done: Set<string>;

  if (opts.resumeRunId) {
    const run = await store.getRun(opts.resumeRunId);
    if (!run) throw new Error(`run ${opts.resumeRunId} not found`);
    runId = run.id;
    memberIds = run.params.memberIds;
    sources = run.sources;
    done = new Set(run.cursor.done);
    await store.startRun({ id: runId, sources, params: run.params });
    log(`[mp-ingest] resuming ${runId}: ${done.size} member:source pairs already done`);
  } else {
    runId = opts.runId ?? newRunId();
    memberIds = [...new Set(opts.memberIds ?? [])];
    sources = opts.sources ?? INGESTABLE_SOURCES;
    done = new Set();
    await store.startRun({ id: runId, sources, params: { memberIds } });
  }

  // members must run before electoral_commission (EC search uses the name).
  const ordered = [...sources].sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b));
  const names = new Map<number, string>();
  const outcomes: IngestReport["outcomes"] = {};
  const errors: string[] = [];

  for (const memberId of memberIds) {
    outcomes[memberId] = {};
    for (const source of ordered) {
      const key = `${memberId}:${source}`;
      if (done.has(key)) {
        outcomes[memberId][source] = { status: "skipped", reason: "done in an earlier attempt of this run" };
        continue;
      }
      if (STUB_SOURCES.includes(source)) {
        outcomes[memberId][source] = { status: "skipped", reason: "stub — see sources/" + (source === "appg" ? "appgs.ts" : "companies-house.ts") };
        continue;
      }
      try {
        const outcome =
          source === "members"
            ? await ingestMembersSource(opts, runId, memberId, names)
            : source === "interests"
              ? await ingestInterestsSource(opts, runId, memberId)
              : await ingestEcSource(opts, runId, memberId, names);
        outcomes[memberId][source] = outcome;
        if (outcome.status === "ok") {
          done.add(key);
          await store.saveCursor(runId, { done: [...done] });
        } else {
          errors.push(`${key}: ${outcome.reason}`);
        }
        log(`[mp-ingest] ${key}: ${outcome.status} records=${outcome.records} +${outcome.inserted} ~${outcome.changed} -${outcome.removed} =${outcome.unchanged}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outcomes[memberId][source] = { status: "error", reason: message };
        errors.push(`${key}: ${message}`);
        log(`[mp-ingest] ${key}: ERROR ${message}`);
      }
    }
  }

  const status = errors.length === 0 ? "completed" : "failed";
  await store.finishRun(runId, status, { outcomes }, errors.length ? errors.join("\n") : undefined);
  return { runId, status, outcomes, errors };
}
