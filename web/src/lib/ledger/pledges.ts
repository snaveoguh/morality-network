// Pledge Ledger — public-money pledges and whether they are delivered.
//
// Sibling of the Claim Ledger: a claim is something said at the despatch box,
// a pledge is money a government or strategic authority says it will spend.
// Same discipline — verbatim quote, source link, no motive language — and the
// same daily Merkle root (see computeLedgerDayRoot in ./merkle).
//
// Source of truth for the prototype is the checked-in seed file
// (sources/pledges.json), so the page renders with no DATABASE_URL. Every
// status change is a seed edit with a fresh lastCheckedOn, which puts the new
// state into that day's anchored root.

import { createHash } from "node:crypto";
import seed from "./sources/pledges.json";

/** Delivery vocabulary. Fixed — a pledge only ever moves along this track
 *  (or is "unknown" when the record cannot settle it). */
export const PLEDGE_STATUSES = [
  "announced",
  "allocated",
  "spent",
  "delivered",
  "unknown",
] as const;
export type PledgeStatus = (typeof PLEDGE_STATUSES)[number];

export interface PledgeEvidence {
  url: string;
  label: string;
}

export interface Pledge {
  /** Stable slug — the detail page URL and part of the leaf hash. */
  id: string;
  title: string;
  /** Whole pounds. */
  amountGbp: number;
  /** True when the source says "around" / "nearly". */
  approx: boolean;
  /** Department or authority that made the pledge. */
  owner: string;
  jurisdiction: string;
  /** Set when this pledge is a line inside a larger package. */
  parentId: string | null;
  /** ISO date the pledge was announced. */
  announcedOn: string;
  /** Exact text from the source. Never paraphrased. */
  verbatimQuote: string;
  sourceUrl: string;
  sourceTitle: string;
  status: PledgeStatus;
  evidence: PledgeEvidence[];
  /** ISO date the status was last checked against the record. */
  lastCheckedOn: string;
  /** What the record does and doesn't show. Stated, not inferred. */
  notes: string;
  /** Morality Co-operative may apply to this programme. */
  declaredInterest: boolean;
}

export interface PledgeSeed {
  schemaVersion: number;
  pledges: Pledge[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Structural checks on a pledge set. Returns human-readable problems; an empty
 * array means the set is publishable. Package lines must not sum to more than
 * their parent (exactly equal unless any figure is approximate).
 */
export function validatePledges(pledges: Pledge[]): string[] {
  const problems: string[] = [];
  const byId = new Map<string, Pledge>();
  for (const p of pledges) {
    if (byId.has(p.id)) problems.push(`${p.id}: duplicate id`);
    byId.set(p.id, p);
  }
  for (const p of pledges) {
    if (!/^[a-z0-9-]+$/.test(p.id)) problems.push(`${p.id}: id must be a slug`);
    if (!Number.isInteger(p.amountGbp) || p.amountGbp <= 0)
      problems.push(`${p.id}: amountGbp must be a positive integer`);
    if (!PLEDGE_STATUSES.includes(p.status))
      problems.push(`${p.id}: unknown status "${p.status}"`);
    if (!ISO_DATE.test(p.announcedOn)) problems.push(`${p.id}: bad announcedOn`);
    if (!ISO_DATE.test(p.lastCheckedOn)) problems.push(`${p.id}: bad lastCheckedOn`);
    if (p.lastCheckedOn < p.announcedOn)
      problems.push(`${p.id}: checked before it was announced`);
    if (!p.verbatimQuote.trim()) problems.push(`${p.id}: missing verbatim quote`);
    if (!p.owner.trim()) problems.push(`${p.id}: missing owner`);
    for (const url of [p.sourceUrl, ...p.evidence.map((e) => e.url)]) {
      if (!url.startsWith("https://")) problems.push(`${p.id}: non-https url ${url}`);
    }
    if (p.parentId !== null) {
      const parent = byId.get(p.parentId);
      if (!parent) problems.push(`${p.id}: parent ${p.parentId} not found`);
      else if (parent.parentId !== null)
        problems.push(`${p.id}: packages nest one level only`);
    }
  }
  for (const parent of pledges) {
    const lines = pledges.filter((p) => p.parentId === parent.id);
    if (lines.length === 0) continue;
    const sum = lines.reduce((acc, p) => acc + p.amountGbp, 0);
    const approx = parent.approx || lines.some((p) => p.approx);
    if (sum > parent.amountGbp && !approx)
      problems.push(`${parent.id}: lines sum to ${sum}, more than ${parent.amountGbp}`);
    if (sum < parent.amountGbp && !approx && lines.length > 1)
      problems.push(`${parent.id}: lines sum to ${sum}, less than ${parent.amountGbp}`);
  }
  return problems;
}

/** All seeded pledges, in seed order. Throws if the seed is malformed. */
export function loadPledges(source: PledgeSeed = seed as PledgeSeed): Pledge[] {
  const problems = validatePledges(source.pledges);
  if (problems.length > 0) {
    throw new Error(`pledge seed invalid:\n${problems.join("\n")}`);
  }
  return source.pledges;
}

export function getPledge(id: string, pledges = loadPledges()): Pledge | null {
  return pledges.find((p) => p.id === id) ?? null;
}

export function pledgeLines(parentId: string, pledges = loadPledges()): Pledge[] {
  return pledges.filter((p) => p.parentId === parentId);
}

export function countByStatus(pledges: Pledge[]): Record<PledgeStatus, number> {
  const counts = Object.fromEntries(PLEDGE_STATUSES.map((s) => [s, 0])) as Record<
    PledgeStatus,
    number
  >;
  for (const p of pledges) counts[p.status] += 1;
  return counts;
}

/** £210m, £30.4m, £564k, £1.14bn — newsroom style. */
export function formatGbp(amount: number, approx = false): string {
  const prefix = approx ? "~£" : "£";
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (amount >= 1e9) return `${prefix}${trim(amount / 1e9)}bn`;
  if (amount >= 1e6) return `${prefix}${trim(amount / 1e6)}m`;
  if (amount >= 1e3) return `${prefix}${trim(amount / 1e3)}k`;
  return `${prefix}${amount}`;
}

/** Pledges whose state was checked on the given UTC day — the pledge half
 *  of that day's Merkle batch. */
export function pledgesCheckedOn(day: string, pledges = loadPledges()): Pledge[] {
  return pledges.filter((p) => p.lastCheckedOn === day);
}

/**
 * Canonical leaf hash for one pledge *state*. Prefixed "pledge" so a pledge
 * leaf can never collide with a claim leaf in the shared daily tree. Field
 * order is part of the format; status and lastCheckedOn are included so each
 * re-check anchors the state as it stood.
 */
export function pledgeLeafHash(p: Pledge): string {
  const canonical = JSON.stringify([
    "pledge",
    p.id,
    p.amountGbp,
    p.owner,
    p.announcedOn,
    p.verbatimQuote,
    p.sourceUrl,
    p.status,
    p.evidence.map((e) => e.url),
    p.lastCheckedOn,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
