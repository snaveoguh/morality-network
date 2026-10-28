// Assembles one MP's record for the read API and the page. Server-only.
// Everything here is copied from stored register versions; the only derived
// values are the deterministic stats from stats.ts.

import "server-only";

import { SITE_URL } from "../brand";
import type { LedgerClaim } from "../ledger/types";
import type { MpRecordData, MpTie } from "../db/mp-record";
import { computeAllStats, computeStat, isIsoDate, type StatId, type StatResult } from "./stats";
import { mpLaunchGate } from "./launch-gate";

export const MP_RECORD_DATASET = "pooter world MP Record";
export const MP_RECORD_SPEC_URL =
  "https://github.com/snaveoguh/morality-network/blob/main/docs/MP_RECORD_SPEC.md";

export const MP_RECORD_LICENCES = [
  { name: "Open Parliament Licence v3.0", url: "https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/", covers: "Members API, Register of Members' Financial Interests" },
  { name: "Open Government Licence v3.0", url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/", covers: "Electoral Commission register" },
];

export const MP_RECORD_NOTICE =
  "Facts copied from official registers, in the registers' own words. No characterisation, scoring or inference is made. A register entry is what was registered; it is not a finding about anyone's conduct.";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseMemberId(raw: string): number | null {
  if (!/^\d{1,7}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

export function recordMeta() {
  const gate = mpLaunchGate();
  return {
    dataset: MP_RECORD_DATASET,
    spec: MP_RECORD_SPEC_URL,
    notice: MP_RECORD_NOTICE,
    licences: MP_RECORD_LICENCES,
    legalReview: gate.signedOff ? { status: "signed-off", reference: gate.signedOff } : { status: "pending", reference: null },
    generatedAt: new Date().toISOString(),
  };
}

export interface MpRecord extends MpRecordData {
  memberId: number;
  name: string;
  claims: LedgerClaim[];
  stats: StatResult[];
}

/** null when the DB is not configured or the member has never been ingested. */
export async function loadMpRecord(memberId: number): Promise<MpRecord | null> {
  if (!process.env.DATABASE_URL) return null;
  const { getMpRecordData, getMpStatInputs } = await import("../db/mp-record");
  const data = await getMpRecordData(memberId);
  if (!data.member) return null;
  const name = data.member.data.nameDisplay ?? String(memberId);
  const { listLedgerClaimsForMember } = await import("../db/ledger-claims");
  const [claims, inputs] = await Promise.all([
    listLedgerClaimsForMember(memberId),
    getMpStatInputs(memberId, name),
  ]);
  return { ...data, memberId, name, claims, stats: computeAllStats(inputs, todayIso(), SITE_URL) };
}

export async function loadMpTies(memberId: number): Promise<{ name: string; ties: MpTie[] } | null> {
  if (!process.env.DATABASE_URL) return null;
  const { getMpRecordData, getMpTies } = await import("../db/mp-record");
  const data = await getMpRecordData(memberId);
  if (!data.member) return null;
  return { name: data.member.data.nameDisplay ?? String(memberId), ties: await getMpTies(memberId) };
}

export type StatLoad =
  | { ok: true; stat: StatResult }
  | { ok: false; status: 400 | 404 | 503; error: string };

export async function loadMpStat(memberId: number, statId: StatId, asOf: string): Promise<StatLoad> {
  if (!isIsoDate(asOf)) return { ok: false, status: 400, error: "asOf must be a real date, YYYY-MM-DD" };
  if (asOf > todayIso()) return { ok: false, status: 400, error: "asOf cannot be in the future" };
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "MP Record database not configured" };
  const { getMpRecordData, getMpStatInputs } = await import("../db/mp-record");
  const data = await getMpRecordData(memberId);
  if (!data.member) return { ok: false, status: 404, error: "member not in the MP Record" };
  const name = data.member.data.nameDisplay ?? String(memberId);
  return { ok: true, stat: computeStat(statId, await getMpStatInputs(memberId, name), asOf, SITE_URL) };
}
