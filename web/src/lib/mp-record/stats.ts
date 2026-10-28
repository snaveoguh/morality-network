// MP Record stats (MP_RECORD_SPEC §7). Deterministic, reproducible
// aggregates: each is a pure function of stored register versions and an
// "as of" date, computed in integer pence. Same inputs + same asOf → same
// number, forever; that is what makes the permalink citeable.

import { formatGbp, parseMoneyToPence } from "./parse-utils";
import { REGISTER_TOP_LEVEL_CATEGORIES, topLevelCategory } from "./sources/interests";
import { snapshotAsOf } from "./versioning";
import type { StoredVersion } from "./types";

export const CURRENT_PARLIAMENT_START = "2024-07-04"; // 2024 general election (Members API membership start)
export const STATS_VERSION = "mp-stats-v1";

export type StatId =
  | "interests-value-12m"
  | "interests-value-parliament"
  | "interests-count"
  | "donations-ec-12m"
  | "claims-by-status";

export interface StatDefinition {
  id: StatId;
  label: string;
  source: string;
  sourceUrl: string;
  methodology: string[];
}

const RMFI = "Register of Members' Financial Interests";
const RMFI_URL = "https://www.parliament.uk/mps-lords-and-offices/standards-and-financial-interests/parliamentary-commissioner-for-standards/registers-of-interests/register-of-members-financial-interests/";
const EC = "Electoral Commission register of donations";
const EC_URL = "https://search.electoralcommission.org.uk/";

const SUM_RULES = [
  "Sums are of the value stated in the register, in exact decimal arithmetic, GBP only. Entries stated in another currency are counted and listed, not converted.",
  "Category 1.2 (ongoing paid employment) values are per period (e.g. monthly); they are excluded from sums and reported as a count of agreements.",
  "Category 1 parent entries carry no value; their individual payments do. Nothing is counted twice.",
  "Entries with no stated value contribute nothing to a sum and are counted separately. Visits outside the UK (category 4) currently carry no value in the register's API.",
  "Register category 2 and Electoral Commission donations often describe the same donation. This figure must never be added to the Electoral Commission figure.",
  "A registered value is what the Member registered. It is not a finding about the Member's conduct.",
];

export const STAT_DEFINITIONS: Record<StatId, StatDefinition> = {
  "interests-value-12m": {
    id: "interests-value-12m",
    label: "Registered payments, gifts and donations with a stated value, last 12 months",
    source: RMFI,
    sourceUrl: RMFI_URL,
    methodology: [
      "Window: register entries whose registration date is after the same calendar day one year before the as-of date, up to and including the as-of date.",
      ...SUM_RULES,
    ],
  },
  "interests-value-parliament": {
    id: "interests-value-parliament",
    label: "Registered payments, gifts and donations with a stated value, since the 2024 general election",
    source: RMFI,
    sourceUrl: RMFI_URL,
    methodology: [
      `Window: register entries whose registration date is on or after ${CURRENT_PARLIAMENT_START} (the 2024 general election), up to and including the as-of date.`,
      ...SUM_RULES,
    ],
  },
  "interests-count": {
    id: "interests-count",
    label: "Entries in the Register of Members' Financial Interests",
    source: RMFI,
    sourceUrl: RMFI_URL,
    methodology: [
      "Count of top-level register entries present in the register on the as-of date, by category. Individual payments listed under an entry are not counted separately.",
      "The count reflects what the register lists. It says nothing about whether an interest is significant.",
    ],
  },
  "donations-ec-12m": {
    id: "donations-ec-12m",
    label: "Donations reported to the Electoral Commission, last 12 months",
    source: EC,
    sourceUrl: EC_URL,
    methodology: [
      "Donations to the Member as a regulated donee (recipient type 'MP - Member of Parliament') whose accepted date is after the same calendar day one year before the as-of date, up to and including the as-of date.",
      "The Commission's records name a regulated entity, not a Parliament member id. Only entities a named human reviewer confirmed as this Member, on or before the as-of date, are included.",
      "Values as stated by the Commission, GBP, exact decimal arithmetic.",
      "Many of these donations also appear in category 2 of the Register of Members' Financial Interests. Never add the two figures together.",
    ],
  },
  "claims-by-status": {
    id: "claims-by-status",
    label: "Claims on the pooter world Claim Ledger",
    source: "pooter world Claim Ledger (Hansard)",
    sourceUrl: "https://pooter.world/ledger",
    methodology: [
      "Statements by the Member extracted verbatim from Hansard into the Claim Ledger on or before the as-of date, by claim type, with verdicts only where a human reviewer published one on or before the as-of date.",
      "A claim's presence on the ledger means the Member said it in Parliament. 'Unresolved' means no verdict has been published; it is not a judgement.",
    ],
  },
};

export function isStatId(value: string): value is StatId {
  return Object.prototype.hasOwnProperty.call(STAT_DEFINITIONS, value);
}

export interface LedgerClaimFact {
  claimId: string;
  createdAt: string; // ISO
  claimType: "retrodictable" | "predictive" | "unfalsifiable";
  verdict: "true" | "false" | "partial" | "unresolved" | null;
  verdictPublishedAt: string | null;
}

export interface StatInputs {
  memberId: number;
  memberName: string;
  interests: StoredVersion<"mp_interests">[];
  /** All versions for every EC entity ever linked (any status) — filtered here. */
  donations: StoredVersion<"mp_donations">[];
  /** Confirmed EC links for this member. */
  ecLinks: Array<{ externalId: string; reviewedAt: string }>;
  checks: Array<{ source: string; scopeKey: string; checkedAt: string }>;
  claims: LedgerClaimFact[];
}

export interface StatBreakdownRow {
  key: string;
  label: string;
  count: number;
  valuePence?: number;
  display: string;
}

export interface StatResult {
  id: StatId;
  version: string;
  label: string;
  memberId: number;
  memberName: string;
  asOf: string;
  /** Last complete register check on or before asOf that the figure rests on. */
  dataAsOf: string | null;
  available: boolean;
  unavailableReason?: string;
  /** from is exclusive unless fromInclusive; to is inclusive. */
  window: { from: string | null; fromInclusive: boolean; to: string; basis: string };
  headline: string;
  valuePence?: number;
  count?: number;
  breakdown: StatBreakdownRow[];
  notes: string[];
  /** Every register entry the figure used — the audit trail. */
  rowsUsed: Array<{ sourceRecordId: string; sourceUrl: string; valuePence: number | null }>;
  methodology: string[];
  source: string;
  sourceUrl: string;
  permalink: string;
  apiUrl: string;
  citation: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** End of the as-of day, UTC — everything retrieved up to then counts. */
export function asOfEnd(asOf: string): Date {
  return new Date(`${asOf}T23:59:59.999Z`);
}

/** The same calendar day one year earlier (29 Feb → 28 Feb). Window is (from, asOf]. */
export function oneYearBefore(asOf: string): string {
  const [y, m, d] = asOf.split("-").map(Number);
  const candidate = new Date(Date.UTC(y - 1, m - 1, d));
  if (candidate.getUTCMonth() !== m - 1) return new Date(Date.UTC(y - 1, m - 1, d - 1)).toISOString().slice(0, 10);
  return candidate.toISOString().slice(0, 10);
}

export function formatLongDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function statPermalink(siteUrl: string, memberId: number, id: StatId, asOf: string): string {
  return `${siteUrl.replace(/\/$/, "")}/mp/${memberId}/stats/${id}?asOf=${asOf}`;
}

/** "Cite this" — MP_RECORD_SPEC §7 citation format. */
export function citeStat(r: Pick<StatResult, "label" | "memberName" | "memberId" | "headline" | "asOf" | "source" | "permalink">): string {
  return `pooter world MP Record, "${r.label}" for ${r.memberName} (${r.memberId}): ${r.headline}, as of ${formatLongDate(r.asOf)}. Source: ${r.source}. ${r.permalink}`;
}

function latestCheck(
  checks: StatInputs["checks"],
  source: string,
  scopeKey: string,
  cutoff: Date,
): string | null {
  let best: string | null = null;
  for (const c of checks) {
    if (c.source !== source || c.scopeKey !== scopeKey) continue;
    if (Date.parse(c.checkedAt) > cutoff.getTime()) continue;
    if (best === null || Date.parse(c.checkedAt) > Date.parse(best)) best = c.checkedAt;
  }
  return best;
}

function inWindow(date: string | null, from: string | null, to: string, fromInclusive: boolean): boolean {
  if (!date) return false;
  if (date > to) return false;
  if (from === null) return true;
  return fromInclusive ? date >= from : date > from;
}

function categoryLabel(top: string): string {
  return REGISTER_TOP_LEVEL_CATEGORIES[top] ? `${top}. ${REGISTER_TOP_LEVEL_CATEGORIES[top]}` : `Category ${top}`;
}

function compareCategory(a: string, b: string): number {
  return Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0);
}

type Core = Omit<StatResult, "id" | "version" | "label" | "memberId" | "memberName" | "asOf" | "methodology" | "source" | "sourceUrl" | "permalink" | "apiUrl" | "citation">;

function unavailable(reason: string, window: StatResult["window"]): Core {
  return { dataAsOf: null, available: false, unavailableReason: reason, window, headline: "not available", breakdown: [], notes: [], rowsUsed: [] };
}

function interestsValue(inputs: StatInputs, asOf: string, from: string | null, fromInclusive: boolean): Core {
  const cutoff = asOfEnd(asOf);
  const window = { from, fromInclusive, to: asOf, basis: "register registration date" };
  const dataAsOf = latestCheck(inputs.checks, "interests", `member:${inputs.memberId}`, cutoff);
  if (!dataAsOf) return unavailable("no complete check of the register for this Member on or before this date", window);

  const rows = snapshotAsOf(inputs.interests, cutoff).filter((v) =>
    inWindow(v.data.registrationDate, from, asOf, fromInclusive),
  );
  const byCat = new Map<string, { pence: number; count: number }>();
  const rowsUsed: StatResult["rowsUsed"] = [];
  let total = 0;
  let noValue = 0;
  let regular = 0;
  const foreign: string[] = [];
  for (const v of rows) {
    const d = v.data;
    const top = topLevelCategory(d.categoryNumber) ?? "?";
    if (d.isRegularPayment) {
      regular += 1;
      continue;
    }
    if (d.valueAmount !== null && d.valueCurrency !== "GBP") {
      foreign.push(`${d.valueCurrency ?? "unstated currency"} ${d.valueAmount} (entry ${d.interestId})`);
      continue;
    }
    const pence = parseMoneyToPence(d.valueGbp);
    if (pence === null) {
      // Category 1 parent entries hold no value by design; their payments do.
      if (!(top === "1" && d.parentInterestId === null)) noValue += 1;
      continue;
    }
    total += pence;
    const cur = byCat.get(top) ?? { pence: 0, count: 0 };
    cur.pence += pence;
    cur.count += 1;
    byCat.set(top, cur);
    rowsUsed.push({ sourceRecordId: v.sourceRecordId, sourceUrl: v.sourceApiUrl, valuePence: pence });
  }
  const notes: string[] = [];
  if (noValue > 0) notes.push(`${noValue} ${noValue === 1 ? "entry has" : "entries have"} no stated value and ${noValue === 1 ? "is" : "are"} not included.`);
  if (regular > 0) notes.push(`${regular} ongoing employment ${regular === 1 ? "agreement" : "agreements"} (category 1.2, per-period values) not included.`);
  if (foreign.length > 0) notes.push(`Not converted and not included: ${foreign.join("; ")}.`);
  return {
    dataAsOf,
    available: true,
    window,
    headline: formatGbp(total),
    valuePence: total,
    count: rowsUsed.length,
    breakdown: [...byCat.entries()]
      .sort(([a], [b]) => compareCategory(a, b))
      .map(([key, c]) => ({ key, label: categoryLabel(key), count: c.count, valuePence: c.pence, display: formatGbp(c.pence) })),
    notes,
    rowsUsed,
  };
}

function interestsCount(inputs: StatInputs, asOf: string): Core {
  const cutoff = asOfEnd(asOf);
  const window = { from: null, fromInclusive: false, to: asOf, basis: "entries present in the register on the as-of date" };
  const dataAsOf = latestCheck(inputs.checks, "interests", `member:${inputs.memberId}`, cutoff);
  if (!dataAsOf) return unavailable("no complete check of the register for this Member on or before this date", window);
  const rows = snapshotAsOf(inputs.interests, cutoff).filter((v) => v.data.parentInterestId === null);
  const byCat = new Map<string, number>();
  for (const v of rows) {
    const top = topLevelCategory(v.data.categoryNumber) ?? "?";
    byCat.set(top, (byCat.get(top) ?? 0) + 1);
  }
  return {
    dataAsOf,
    available: true,
    window,
    headline: String(rows.length),
    count: rows.length,
    breakdown: [...byCat.entries()]
      .sort(([a], [b]) => compareCategory(a, b))
      .map(([key, n]) => ({ key, label: categoryLabel(key), count: n, display: String(n) })),
    notes: [],
    rowsUsed: rows.map((v) => ({ sourceRecordId: v.sourceRecordId, sourceUrl: v.sourceApiUrl, valuePence: null })),
  };
}

function donationsEc(inputs: StatInputs, asOf: string): Core {
  const cutoff = asOfEnd(asOf);
  const from = oneYearBefore(asOf);
  const window = { from, fromInclusive: false, to: asOf, basis: "Electoral Commission accepted date" };
  const links = inputs.ecLinks.filter((l) => Date.parse(l.reviewedAt) <= cutoff.getTime());
  if (links.length === 0) {
    return unavailable("no Electoral Commission record confirmed as this Member by a reviewer on or before this date", window);
  }
  const checkDates: string[] = [];
  for (const l of links) {
    const c = latestCheck(inputs.checks, "electoral_commission", `ec-entity:${l.externalId}`, cutoff);
    if (!c) return unavailable(`no complete check of Electoral Commission entity ${l.externalId} on or before this date`, window);
    checkDates.push(c);
  }
  const dataAsOf = checkDates.sort()[0]; // the oldest check is the honest "as of"
  const linked = new Set(links.map((l) => `ec-entity:${l.externalId}`));
  const rows = snapshotAsOf(
    inputs.donations.filter((v) => linked.has(v.scopeKey)),
    cutoff,
  ).filter((v) => inWindow(v.data.acceptedDate, from, asOf, false));

  const byType = new Map<string, { pence: number; count: number }>();
  const rowsUsed: StatResult["rowsUsed"] = [];
  let total = 0;
  let noValue = 0;
  for (const v of rows) {
    const pence = parseMoneyToPence(v.data.valueGbp);
    if (pence === null) {
      noValue += 1;
      continue;
    }
    total += pence;
    const key = v.data.donationType ?? "Not stated";
    const cur = byType.get(key) ?? { pence: 0, count: 0 };
    cur.pence += pence;
    cur.count += 1;
    byType.set(key, cur);
    rowsUsed.push({ sourceRecordId: v.sourceRecordId, sourceUrl: v.sourceUrl, valuePence: pence });
  }
  return {
    dataAsOf,
    available: true,
    window,
    headline: formatGbp(total),
    valuePence: total,
    count: rowsUsed.length,
    breakdown: [...byType.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, c]) => ({ key, label: key, count: c.count, valuePence: c.pence, display: formatGbp(c.pence) })),
    notes: noValue > 0 ? [`${noValue} record(s) with no stated value not included.`] : [],
    rowsUsed,
  };
}

const CLAIM_TYPE_LABEL: Record<LedgerClaimFact["claimType"], string> = {
  retrodictable: "Checkable now",
  predictive: "Checkable later",
  unfalsifiable: "Not checkable",
};
const VERDICT_LABEL: Record<string, string> = {
  true: "Resolved true",
  false: "Resolved false",
  partial: "Partially true",
  unresolved: "Unresolved",
};

function claimsByStatus(inputs: StatInputs, asOf: string): Core {
  const cutoff = asOfEnd(asOf).getTime();
  const window = { from: null, fromInclusive: false, to: asOf, basis: "date the claim was recorded on the ledger" };
  const claims = inputs.claims.filter((c) => Date.parse(c.createdAt) <= cutoff);
  const rows = new Map<string, number>();
  for (const c of claims) {
    const published = c.verdict && c.verdict !== "unresolved" && c.verdictPublishedAt && Date.parse(c.verdictPublishedAt) <= cutoff;
    const status = published ? c.verdict! : "unresolved";
    const key = `${c.claimType}:${status}`;
    rows.set(key, (rows.get(key) ?? 0) + 1);
  }
  const order: LedgerClaimFact["claimType"][] = ["retrodictable", "predictive", "unfalsifiable"];
  const verdictOrder = ["true", "partial", "false", "unresolved"];
  const breakdown = [...rows.entries()]
    .sort(([a], [b]) => {
      const [ta, va] = a.split(":");
      const [tb, vb] = b.split(":");
      return order.indexOf(ta as never) - order.indexOf(tb as never) || verdictOrder.indexOf(va) - verdictOrder.indexOf(vb);
    })
    .map(([key, n]) => {
      const [type, status] = key.split(":");
      return { key, label: `${CLAIM_TYPE_LABEL[type as LedgerClaimFact["claimType"]]} — ${VERDICT_LABEL[status]}`, count: n, display: String(n) };
    });
  return {
    dataAsOf: asOf,
    available: true,
    window,
    headline: String(claims.length),
    count: claims.length,
    breakdown,
    notes: [],
    rowsUsed: claims.map((c) => ({ sourceRecordId: c.claimId, sourceUrl: `https://pooter.world/ledger/member/${inputs.memberId}`, valuePence: null })),
  };
}

export function computeStat(id: StatId, inputs: StatInputs, asOf: string, siteUrl: string): StatResult {
  if (!isIsoDate(asOf)) throw new Error(`computeStat: asOf must be YYYY-MM-DD, got ${asOf}`);
  const def = STAT_DEFINITIONS[id];
  const core =
    id === "interests-value-12m"
      ? interestsValue(inputs, asOf, oneYearBefore(asOf), false)
      : id === "interests-value-parliament"
        ? interestsValue(inputs, asOf, CURRENT_PARLIAMENT_START, true)
        : id === "interests-count"
          ? interestsCount(inputs, asOf)
          : id === "donations-ec-12m"
            ? donationsEc(inputs, asOf)
            : claimsByStatus(inputs, asOf);
  const permalink = statPermalink(siteUrl, inputs.memberId, id, asOf);
  const base = {
    id,
    version: STATS_VERSION,
    label: def.label,
    memberId: inputs.memberId,
    memberName: inputs.memberName,
    asOf,
    methodology: def.methodology,
    source: def.source,
    sourceUrl: def.sourceUrl,
    permalink,
    apiUrl: `${siteUrl.replace(/\/$/, "")}/api/mp/${inputs.memberId}/stats/${id}?asOf=${asOf}`,
    ...core,
  };
  return { ...base, citation: core.available ? citeStat(base) : "" };
}

export function computeAllStats(inputs: StatInputs, asOf: string, siteUrl: string): StatResult[] {
  return (Object.keys(STAT_DEFINITIONS) as StatId[]).map((id) => computeStat(id, inputs, asOf, siteUrl));
}
