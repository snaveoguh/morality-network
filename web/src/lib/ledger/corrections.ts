// Corrections register — Hansard / questions-statements client + parsers.
// Sibling of ./hansard.ts (debate text). This module fetches the record of
// ministers CORRECTING what they told Parliament, so the ledger can measure
// how long "at the earliest opportunity" (Ministerial Code §1.3c) takes.
//
// Three sources, all free / no auth:
//   1. Corrected written answers — questions-statements-api `writtenquestions`
//      with `correctedWhenFrom`. Each record carries the original answer date,
//      the correction date, the original and the corrected text.
//   2. Written ministerial statements titled "Correction …" — corrections to
//      oral answers, debates and earlier statements. `linkedStatements` gives
//      the corrected statement (exact original date) and the other House's
//      duplicate (JointStatement), which we collapse.
//   3. Oral self-corrections on points of order — Hansard contribution search.
//      Noisy (MPs often ask OTHERS to correct the record), so these are
//      CANDIDATES only, always flagged for human review.
//
// Nothing here reaches a verdict. A correction is a fact on the record; the
// register reports it, dates it and links it.

import { fetchWithRetry } from "../fetch-utils";
import {
  CHAIR_ATTRIBUTIONS,
  contributionWebUrl,
  debateWebUrl,
  parseAttribution,
  stripHansardMarkup,
} from "./hansard";

const QS_API = "https://questions-statements-api.parliament.uk/api";
const QS_WEB = "https://questions-statements.parliament.uk";
const HANSARD_API = "https://hansard-api.parliament.uk";
const HANSARD_WEB = "https://hansard.parliament.uk";

/** Stored texts are capped — the register links the full record. */
const TEXT_CAP = 1500;

export type CorrectionKind =
  | "written-answer"
  | "written-statement"
  | "oral-point-of-order";

export interface CorrectionMember {
  memberId: number | null;
  name: string;
  party: string | null;
  /** Office held when correcting, where the record states it. */
  role: string | null;
}

export interface MinisterialCorrection {
  /** Deterministic: `wq:<questionId>` | `wms:<uin>` | `poo:<contributionExtId>`. */
  id: string;
  kind: CorrectionKind;
  house: "Commons" | "Lords";
  /** ISO date the correction was made. */
  correctedOn: string;
  member: CorrectionMember;
  department: string | null;
  /** Short subject line: PQ heading or statement title. */
  heading: string;
  /** ISO date of the statement being corrected, when the record fixes it. */
  originalDate: string | null;
  originalUrl: string | null;
  /** UIN of the corrected item (PQ / WMS), when known. */
  originalRef: string | null;
  /** What was originally said (plain text), when the record states it. */
  originalText: string | null;
  /** The corrected wording, or the full correction text. */
  correctedText: string;
  correctionUrl: string;
  /** correctedOn − originalDate in whole days; null when the original date is unknown. */
  daysToCorrect: number | null;
  /** True when a human must confirm this is a ministerial self-correction. */
  needsReview: boolean;
  /** Other House where the identical correction was also laid. */
  alsoLaidIn: "Commons" | "Lords" | null;
}

// ── small pure helpers ──────────────────────────────────────────────────────

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function cap(text: string): string {
  return text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP - 1).trimEnd()}…` : text;
}

/** Plain text from questions-statements HTML (keeps <del>/<ins> content). */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return stripHansardMarkup(html.replace(/<\/(p|li)>/gi, " "));
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Date of the statement being corrected, read from correction prose.
 * Handles "On 16 July 2026", "On 25 March" (year inferred as the latest
 * not after the correction), "earlier today", "yesterday". Returns null
 * rather than guess.
 */
export function extractOriginalDate(text: string, correctedOn: string): string | null {
  const lower = text.toLowerCase();
  const explicit =
    /\b(\d{1,2})(?:st|nd|rd|th)? (january|february|march|april|may|june|july|august|september|october|november|december)(?:,? (\d{4}))?\b/.exec(
      lower,
    );
  if (explicit) {
    const day = Number(explicit[1]);
    const month = MONTHS[explicit[2]];
    let year = explicit[3] ? Number(explicit[3]) : Number(correctedOn.slice(0, 4));
    const pad = (n: number) => String(n).padStart(2, "0");
    let iso = `${year}-${pad(month)}-${pad(day)}`;
    if (!explicit[3] && iso > correctedOn) {
      year -= 1;
      iso = `${year}-${pad(month)}-${pad(day)}`;
    }
    if (!Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && iso <= correctedOn) return iso;
  }
  if (/\b(i|we) (made|gave|said|answered)\b[^.]{0,80}\btoday\b/.test(lower)) return correctedOn;
  if (/\b(earlier today|earlier this (afternoon|morning|evening)|earlier in (this|today's) debate|questions earlier|in my (speech|remarks|response|answer) earlier)\b/.test(lower)) {
    return correctedOn;
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(`${correctedOn}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Split a correction statement into what was said and what should have been
 * said: "I said: “…”" / "It should have said: “…”". Either side may be null.
 */
export function splitSaidShouldHaveSaid(text: string): {
  said: string | null;
  shouldHaveSaid: string | null;
} {
  // Double quotes first; ‘single’ quotes only when the text has no doubles
  // (a bare ’ is usually an apostrophe — "ALBA’s").
  const double = /[“"]([^”"]{20,})[”"]?/g;
  const single = /‘([^‘]{20,}?)’(?![a-z])/g;
  const quote = /[“"]/.test(text) ? double : single;
  const quotesIn = (s: string) => [...s.matchAll(new RegExp(quote.source, "g"))].map((m) => m[1].trim());

  const pivot =
    /\b(should have (said|read|stated|been)|should read|(more )?(correct|accurate) (answer|figure|statistic|wording|position|number)s?\b[^“"‘]{0,80}\b(is|was|are|were))\b/i.exec(
      text,
    );
  if (!pivot) {
    const first = quotesIn(text)[0];
    return { said: first ?? null, shouldHaveSaid: null };
  }
  const before = quotesIn(text.slice(0, pivot.index));
  const after = quotesIn(text.slice(pivot.index));
  return {
    said: before.length > 0 ? before.join(" … ") : null,
    shouldHaveSaid: after[0] ?? null,
  };
}

/** Title test for written statements that are corrections. */
export function isCorrectionTitle(title: string): boolean {
  return /\bcorrect(ion|ions|ing|ed)?\b/i.test(title) && !/\bcorrectional\b/i.test(title);
}

/** Referenced UIN in a correction title, e.g. "HCWS1455", "PQ HL16235". */
export function referencedUin(title: string): string | null {
  const m = /\b(HCWS\d+|HLWS\d+|HL\d+)\b/i.exec(title) ?? /\b(?:PQ|UIN)\s*(\d{3,})\b/i.exec(title);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Oral self-correction heuristic for a point-of-order contribution. True only
 * when the speaker is correcting THEIR OWN words — "I inadvertently said",
 * "I wish to correct", "correct the record … I said". Candidates still need a
 * human to confirm the speaker was a minister correcting a statement.
 */
export function isOralSelfCorrection(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  if (!/\bpoint of order\b/i.test(t)) return false;
  // Register of interests rectifications are a different procedure.
  if (/\b(declare|declaring|declaration of) (an |my )?interests?\b|\brectification\b/i.test(t)) return false;
  // Strictly first-person: "I inadvertently said", "I misspoke".
  if (/\bI (have |had )?(previously |may have )?(inadvertently|mistakenly|incorrectly|wrongly|misspoke)\b/i.test(t)) return true;
  if (/\b(correct|apologise for) (an?|my) (inadvertent |factual )?(error|mistake|misstatement)\b/i.test(t) && /\bI\b/.test(t)) return true;
  if (/\bI (wish|want|would like|need|must|should like|seek) to correct (the|my|what|an?)\b/i.test(t)) return true;
  if (/\bI (said|stated|gave|quoted|referred to|mentioned|told the House)\b[^.]{0,160}\b(in error|incorrect|wrong|should have (said|been))\b/i.test(t)) return true;
  return false;
}

// ── raw payload shapes ──────────────────────────────────────────────────────

interface QsMember {
  id: number;
  name: string;
  partyAbbreviation?: string | null;
}

export interface RawWrittenQuestion {
  id: number;
  house: string;
  uin: string;
  dateTabled: string;
  dateAnswered: string | null;
  dateAnswerCorrected: string | null;
  answerIsCorrection: boolean;
  answeringBodyName: string | null;
  heading: string | null;
  questionText: string | null;
  answerText: string | null;
  originalAnswerText: string | null;
  answeringMemberId: number | null;
  answeringMember: QsMember | null;
  correctingMemberId: number | null;
  correctingMember: QsMember | null;
}

export interface RawWrittenStatement {
  id: number;
  memberId: number | null;
  member: QsMember | null;
  memberRole: string | null;
  uin: string;
  dateMade: string;
  answeringBodyName: string | null;
  title: string;
  text: string | null;
  house: string;
  linkedStatements: Array<{ linkedStatementId: number; linkType: string; linkDate: string }> | null;
}

export interface RawSpokenContribution {
  MemberName: string | null;
  MemberId: string | number | null;
  AttributedTo: string | null;
  ContributionExtId: string;
  ContributionTextFull: string | null;
  ContributionText: string | null;
  DebateSection: string | null;
  DebateSectionExtId: string;
  SittingDate: string;
  House: string;
}

function houseOf(value: string): "Commons" | "Lords" {
  return value === "Lords" ? "Lords" : "Commons";
}

export function writtenQuestionUrl(dateTabled: string, uin: string): string {
  return `${QS_WEB}/written-questions/detail/${isoDay(dateTabled)}/${uin}`;
}

export function writtenStatementUrl(dateMade: string, uin: string): string {
  return `${QS_WEB}/written-statements/detail/${isoDay(dateMade)}/${uin}`;
}

// ── parsers (pure — tested) ─────────────────────────────────────────────────

/** A corrected written answer → register entry. Null if not a correction. */
export function parseWrittenQuestionCorrection(
  raw: RawWrittenQuestion,
): MinisterialCorrection | null {
  const correctedOn = isoDay(raw.dateAnswerCorrected);
  if (!raw.answerIsCorrection || !correctedOn) return null;
  const originalDate = isoDay(raw.dateAnswered);
  const who = raw.correctingMember ?? raw.answeringMember;
  const memberId = raw.correctingMemberId ?? raw.answeringMemberId ?? who?.id ?? null;
  const url = writtenQuestionUrl(raw.dateTabled, raw.uin);
  const originalText = htmlToText(raw.originalAnswerText);
  const days = originalDate ? daysBetween(originalDate, correctedOn) : null;

  return {
    id: `wq:${raw.id}`,
    kind: "written-answer",
    house: houseOf(raw.house),
    correctedOn,
    member: {
      memberId,
      name: who?.name ?? (memberId ? `Member ${memberId}` : "Unknown"),
      party: who?.partyAbbreviation ?? null,
      role: null,
    },
    department: raw.answeringBodyName ?? null,
    heading: (raw.heading || "Written question").trim(),
    originalDate,
    originalUrl: url,
    originalRef: raw.uin,
    originalText: originalText ? cap(originalText) : null,
    correctedText: cap(htmlToText(raw.answerText)),
    correctionUrl: url,
    daysToCorrect: days !== null && days >= 0 ? days : null,
    needsReview: false,
    alsoLaidIn: null,
  };
}

/**
 * A "Correction …" written statement → register entry. `original` is the
 * linked CorrectedStatement when the API exposes it (exact date + link).
 */
export function parseCorrectionStatement(
  raw: RawWrittenStatement,
  original?: Pick<RawWrittenStatement, "uin" | "dateMade"> | null,
): MinisterialCorrection | null {
  if (!isCorrectionTitle(raw.title)) return null;
  const correctedOn = isoDay(raw.dateMade);
  if (!correctedOn) return null;
  const text = htmlToText(raw.text);
  const { said, shouldHaveSaid } = splitSaidShouldHaveSaid(text);

  const linked = raw.linkedStatements?.find((l) => l.linkType === "CorrectedStatement");
  const linkedDate = isoDay(linked?.linkDate ?? original?.dateMade ?? null);
  // Corrections to oral answers often link the Hansard contribution itself.
  const hansardHref = /href="(https:\/\/hansard\.parliament\.uk\/[^"]+)"/i.exec(raw.text ?? "")?.[1] ?? null;
  const hrefDate = hansardHref ? isoDay(/\/(\d{4}-\d{2}-\d{2})\//.exec(hansardHref)?.[1]) : null;
  const proseDate = extractOriginalDate(text, correctedOn);
  const originalDate = linkedDate ?? hrefDate ?? proseDate;
  const ref = original?.uin ?? referencedUin(raw.title);
  const house = houseOf(raw.house);

  let originalUrl: string | null = null;
  if (original?.uin && original.dateMade) {
    originalUrl = writtenStatementUrl(original.dateMade, original.uin);
  } else if (hansardHref) {
    originalUrl = hansardHref;
  } else if (originalDate) {
    // Day view of the sitting — the best stable deep link without the UIN date.
    originalUrl = `${HANSARD_WEB}/${house}/${originalDate}`;
  }

  const days = originalDate ? daysBetween(originalDate, correctedOn) : null;

  return {
    id: `wms:${raw.uin}`,
    kind: "written-statement",
    house,
    correctedOn,
    member: {
      memberId: raw.memberId ?? raw.member?.id ?? null,
      name: raw.member?.name ?? (raw.memberId ? `Member ${raw.memberId}` : "Unknown"),
      party: raw.member?.partyAbbreviation ?? null,
      role: raw.memberRole ?? null,
    },
    department: raw.answeringBodyName ?? null,
    heading: raw.title.trim(),
    originalDate,
    originalUrl,
    originalRef: ref,
    originalText: said ? cap(said) : null,
    correctedText: cap(shouldHaveSaid ?? text),
    correctionUrl: writtenStatementUrl(raw.dateMade, raw.uin),
    daysToCorrect: days !== null && days >= 0 ? days : null,
    // No original date at all: a human must date it before it counts.
    needsReview: originalDate === null,
    alsoLaidIn: null,
  };
}

/** A point-of-order contribution → CANDIDATE entry (always needs review). */
export function parsePointOfOrderCandidate(
  raw: RawSpokenContribution,
): MinisterialCorrection | null {
  const text = stripHansardMarkup(raw.ContributionTextFull || raw.ContributionText || "");
  if (!isOralSelfCorrection(text)) return null;
  if (CHAIR_ATTRIBUTIONS.test((raw.AttributedTo || "").trim())) return null;
  const correctedOn = isoDay(raw.SittingDate);
  if (!correctedOn || !raw.ContributionExtId) return null;
  const memberId = raw.MemberId ? Number(raw.MemberId) || null : null;
  const speaker = parseAttribution(raw.AttributedTo || raw.MemberName || "Unknown", memberId);
  const house = houseOf(raw.House);
  const title = (raw.DebateSection || "Point of order").trim();
  const debateUrl = debateWebUrl(house, correctedOn, raw.DebateSectionExtId, title);
  const originalDate = extractOriginalDate(text, correctedOn);
  const { said, shouldHaveSaid } = splitSaidShouldHaveSaid(text);
  const days = originalDate ? daysBetween(originalDate, correctedOn) : null;

  return {
    id: `poo:${raw.ContributionExtId}`,
    kind: "oral-point-of-order",
    house,
    correctedOn,
    member: { memberId, name: speaker.name, party: speaker.party, role: null },
    department: null,
    heading: title,
    originalDate,
    originalUrl: originalDate === correctedOn ? debateUrl : null,
    originalRef: null,
    originalText: said ? cap(said) : null,
    correctedText: cap(shouldHaveSaid ?? text),
    correctionUrl: contributionWebUrl(debateUrl, raw.ContributionExtId),
    daysToCorrect: days !== null && days >= 0 ? days : null,
    needsReview: true,
    alsoLaidIn: null,
  };
}

/**
 * Collapse the same correction laid in both Houses (JointStatement link, or
 * identical title + date + department). The Commons copy is kept.
 */
export function dedupeJointStatements(
  rows: Array<{ raw: RawWrittenStatement; parsed: MinisterialCorrection }>,
): MinisterialCorrection[] {
  const byKey = new Map<string, MinisterialCorrection>();
  const idToKey = new Map<number, string>();
  for (const { raw, parsed } of rows) {
    const joint = raw.linkedStatements?.find((l) => l.linkType === "JointStatement");
    const key =
      (joint && idToKey.get(joint.linkedStatementId)) ??
      `${parsed.correctedOn}|${parsed.department ?? ""}|${parsed.heading.toLowerCase().replace(/\s+/g, " ")}`;
    idToKey.set(raw.id, key);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, parsed);
      continue;
    }
    const [keep, drop] = existing.house === "Commons" ? [existing, parsed] : [parsed, existing];
    byKey.set(key, {
      ...keep,
      originalDate: keep.originalDate ?? drop.originalDate,
      originalUrl: keep.originalUrl ?? drop.originalUrl,
      daysToCorrect: keep.daysToCorrect ?? drop.daysToCorrect,
      alsoLaidIn: drop.house,
    });
  }
  return [...byKey.values()];
}

// ── register statistics ─────────────────────────────────────────────────────

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface CorrectionsStats {
  total: number;
  /** Corrections a human must still confirm (oral candidates etc.). */
  needingReview: number;
  /** Entries with a known original date (the median's base). */
  dated: number;
  medianDays: number | null;
  medianDaysByKind: Partial<Record<CorrectionKind, number | null>>;
  /** Share of dated corrections made more than 30 days after the statement. */
  over30Days: number;
  byDepartment: Array<{ department: string; count: number; medianDays: number | null }>;
  byMinister: Array<{ name: string; memberId: number | null; count: number; medianDays: number | null }>;
}

/** Stats over CONFIRMED entries — review-flagged candidates are excluded. */
export function computeCorrectionsStats(all: MinisterialCorrection[]): CorrectionsStats {
  const confirmed = all.filter((c) => !c.needsReview);
  const daysOf = (rows: MinisterialCorrection[]) =>
    rows.map((c) => c.daysToCorrect).filter((d): d is number => d !== null);

  const group = <K extends string>(keyOf: (c: MinisterialCorrection) => K) => {
    const map = new Map<K, MinisterialCorrection[]>();
    for (const c of confirmed) {
      const k = keyOf(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return map;
  };

  const kinds: CorrectionKind[] = ["written-answer", "written-statement", "oral-point-of-order"];
  const medianDaysByKind: CorrectionsStats["medianDaysByKind"] = {};
  for (const kind of kinds) {
    const rows = confirmed.filter((c) => c.kind === kind);
    if (rows.length > 0) medianDaysByKind[kind] = median(daysOf(rows));
  }

  const dated = daysOf(confirmed);
  const byDepartment = [...group((c) => c.department ?? "Unattributed").entries()]
    .map(([department, rows]) => ({ department, count: rows.length, medianDays: median(daysOf(rows)) }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));
  const byMinister = [...group((c) => (c.member.memberId ? `id:${c.member.memberId}` : `name:${c.member.name}`)).values()]
    .map((rows) => ({
      name: rows[0].member.name,
      memberId: rows[0].member.memberId,
      count: rows.length,
      medianDays: median(daysOf(rows)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    total: confirmed.length,
    needingReview: all.length - confirmed.length,
    dated: dated.length,
    medianDays: median(dated),
    medianDaysByKind,
    over30Days: dated.length ? dated.filter((d) => d > 30).length / dated.length : 0,
    byDepartment,
    byMinister,
  };
}

// ── fetchers ────────────────────────────────────────────────────────────────

const JSON_HEADERS = { headers: { Accept: "application/json" }, next: { revalidate: 86_400 } };

async function getJson<T>(url: string, timeoutMs?: number): Promise<T | null> {
  try {
    const res = await fetchWithRetry(url, JSON_HEADERS, undefined, timeoutMs);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    console.error("[ledger/corrections] fetch failed:", url, error);
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Corrected written answers in [from, to] (by correction date). Full text. */
export async function fetchWrittenAnswerCorrections(
  from: string,
  to: string,
): Promise<MinisterialCorrection[]> {
  const ids: number[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = await getJson<{ totalResults: number; results: Array<{ value: RawWrittenQuestion }> }>(
      `${QS_API}/writtenquestions/questions?correctedWhenFrom=${from}&correctedWhenTo=${to}&take=100&skip=${skip}`,
    );
    if (!page) break;
    ids.push(...page.results.map((r) => r.value.id));
    if (page.results.length < 100 || skip + 100 >= page.totalResults) break;
  }
  // The list endpoint truncates answers and omits the original — fetch each.
  const full = await mapLimit(ids, 6, (id) =>
    getJson<{ value: RawWrittenQuestion }>(`${QS_API}/writtenquestions/questions/${id}?expandMember=true`),
  );
  return full
    .map((r) => (r?.value ? parseWrittenQuestionCorrection(r.value) : null))
    .filter((c): c is MinisterialCorrection => c !== null);
}

/** "Correction …" written statements in [from, to], joint copies collapsed. */
export async function fetchCorrectionStatements(
  from: string,
  to: string,
): Promise<MinisterialCorrection[]> {
  const seen = new Set<number>();
  for (const term of ["correction", "corrected", "correct"]) {
    for (let skip = 0; ; skip += 100) {
      const page = await getJson<{ totalResults: number; results: Array<{ value: RawWrittenStatement }> }>(
        `${QS_API}/writtenstatements/statements?searchTerm=${term}&madeWhenFrom=${from}&madeWhenTo=${to}&take=100&skip=${skip}`,
      );
      if (!page) break;
      for (const r of page.results) if (isCorrectionTitle(r.value.title)) seen.add(r.value.id);
      if (page.results.length < 100 || skip + 100 >= page.totalResults) break;
    }
  }

  const rows = await mapLimit([...seen], 6, async (id) => {
    const detail = await getJson<{ value: RawWrittenStatement }>(
      `${QS_API}/writtenstatements/statements/${id}?expandMember=true`,
    );
    if (!detail?.value) return null;
    const raw = detail.value;
    const linked = raw.linkedStatements?.find((l) => l.linkType === "CorrectedStatement");
    const original = linked
      ? (await getJson<{ value: RawWrittenStatement }>(`${QS_API}/writtenstatements/statements/${linked.linkedStatementId}`))?.value ?? null
      : null;
    const parsed = parseCorrectionStatement(raw, original);
    return parsed ? { raw, parsed } : null;
  });
  return dedupeJointStatements(rows.filter((r): r is NonNullable<typeof r> => r !== null));
}

/** Oral self-correction CANDIDATES from points of order in [from, to]. */
export async function fetchPointOfOrderCandidates(
  from: string,
  to: string,
): Promise<MinisterialCorrection[]> {
  const out = new Map<string, MinisterialCorrection>();
  for (const term of ['"correct the record"', "inadvertently", '"I misspoke"']) {
    // Hansard full-text search is slow on wide windows: small pages, long timeout.
    for (let skip = 0; skip < 1000; skip += 50) {
      const page = await getJson<{ TotalResultCount: number; Results: RawSpokenContribution[] }>(
        `${HANSARD_API}/search/contributions/Spoken.json?queryParameters.searchTerm=${encodeURIComponent(term)}&queryParameters.startDate=${from}&queryParameters.endDate=${to}&queryParameters.take=50&queryParameters.skip=${skip}&queryParameters.orderBy=SittingDateDesc`,
        45_000,
      );
      if (!page) break;
      for (const r of page.Results ?? []) {
        const c = parsePointOfOrderCandidate(r);
        if (c) out.set(c.id, c);
      }
      if ((page.Results ?? []).length < 50 || skip + 50 >= page.TotalResultCount) break;
    }
  }
  return [...out.values()];
}

/** Everything in the window, newest correction first. */
export async function fetchCorrectionsWindow(
  from: string,
  to: string,
  opts: { includeOral?: boolean } = {},
): Promise<MinisterialCorrection[]> {
  const [answers, statements, oral] = await Promise.all([
    fetchWrittenAnswerCorrections(from, to),
    fetchCorrectionStatements(from, to),
    opts.includeOral === false ? Promise.resolve([]) : fetchPointOfOrderCandidates(from, to),
  ]);
  return sortCorrections([...answers, ...statements, ...oral]);
}

export function sortCorrections(rows: MinisterialCorrection[]): MinisterialCorrection[] {
  return [...rows].sort((a, b) => b.correctedOn.localeCompare(a.correctedOn) || a.id.localeCompare(b.id));
}
