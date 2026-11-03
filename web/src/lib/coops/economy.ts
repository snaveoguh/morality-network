import "server-only";

// The existing co-op economy, from the committed UK register snapshot
// (scripts/build-coop-economy.mjs → src/data/coops/uk.json). Every area in
// areas.json is a filtered view of that one snapshot: an area with districts
// keeps societies whose registered office is in one of them; an area with no
// districts (the UK) keeps everything. Pure functions; no network or DB.
//
// uk.json is ~2.5 MB. It is only ever read here, on the server; pages send the
// client only the societies they show, and the UK directory searches through
// /api/coops/search instead.

import areasJson from "@/data/coops/areas.json";
import ukJson from "@/data/coops/uk.json";
import type { Area, EconomySnapshot, Society, SocietyHit } from "./types";

interface RawArea extends Partial<Omit<Area, "slug" | "name" | "authority" | "authorityNote">> {
  slug: string;
  name: string;
  authority: string;
  authorityNote: string;
}

interface UkSnapshot {
  source: EconomySnapshot["source"];
  fetchedAt: string;
  count: number;
  unplaced: number;
  columns: string[];
  rows: unknown[][];
}

const AREAS: Record<string, Area> = Object.fromEntries(
  Object.entries(areasJson as Record<string, RawArea>).map(([slug, a]) => [
    slug,
    { ...a, inName: a.inName ?? a.name, districts: a.districts ?? [], towns: a.towns ?? [] },
  ]),
);

const UK = ukJson as unknown as UkSnapshot;

let societiesCache: Society[] | null = null;

/** Every society in the UK snapshot, expanded from its columnar rows. */
function allSocieties(): Society[] {
  if (societiesCache) return societiesCache;
  const cols = UK.columns;
  societiesCache = UK.rows.map((row) => {
    const s: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) s[cols[i]] = row[i];
    return s as unknown as Society;
  });
  return societiesCache;
}

const snapshotCache = new Map<string, EconomySnapshot>();

export function getArea(slug: string): Area | null {
  return AREAS[slug] ?? null;
}

export function listAreas(): Area[] {
  return Object.values(AREAS);
}

/** True for an area that covers the whole UK (no district list). */
export function isNational(area: Area): boolean {
  return area.districts.length === 0;
}

function inArea(area: Area): (s: Society) => boolean {
  if (isNational(area)) return () => true;
  const districts = new Set(area.districts.map((d) => d.name));
  return (s) => districts.has(s.district);
}

export function getSnapshot(slug: string): EconomySnapshot | null {
  const cached = snapshotCache.get(slug);
  if (cached) return cached;
  const area = getArea(slug);
  if (!area) return null;
  const societies = allSocieties().filter(inArea(area));
  const snapshot: EconomySnapshot = {
    area: slug,
    source: UK.source,
    fetchedAt: UK.fetchedAt,
    count: societies.length,
    unplaced: UK.unplaced,
    societies,
  };
  snapshotCache.set(slug, snapshot);
  return snapshot;
}

/** "Registered", "Registered - In Liquidation", … all count as on the register. */
export function isOnRegister(s: Society): boolean {
  return s.status.startsWith("Registered");
}

/** On the register and not in an insolvency or closure process. */
export function isActive(s: Society): boolean {
  return s.status === "Registered";
}

export interface Tally {
  label: string;
  count: number;
}

function tally(items: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface EconomyStats {
  active: Society[];
  closing: Society[];
  byType: Tally[];
  bySector: Tally[];
  /** By district for a local area, by region or nation for the UK. */
  byPlace: Tally[];
  /** How many places the area has (districts, or regions and nations). */
  placeCount: number;
  byDecade: Tally[];
  sinceYear: { year: number; count: number };
  oldest: Society | null;
}

export function economyStats(snapshot: EconomySnapshot, area: Area): EconomyStats {
  const active = snapshot.societies.filter(isActive);
  const closing = snapshot.societies.filter((s) => isOnRegister(s) && !isActive(s));

  let byPlace: Tally[];
  let placeCount: number;
  if (isNational(area)) {
    byPlace = tally(active.map((s) => s.region).filter(Boolean));
    placeCount = new Set(snapshot.societies.map((s) => s.region).filter(Boolean)).size;
  } else {
    const districtCounts = new Map(tally(active.map((s) => s.district)).map((t) => [t.label, t.count]));
    byPlace = area.districts
      .map((d) => ({ label: d.name, count: districtCounts.get(d.name) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    placeCount = area.districts.length;
  }

  const years = active.map((s) => (s.registered ? Number(s.registered.slice(0, 4)) : null));
  const decades = years
    .filter((y): y is number => y !== null)
    .map((y) => `${Math.floor(y / 10) * 10}s`)
    .sort();
  const byDecade = tally(decades).sort((a, b) => a.label.localeCompare(b.label));

  const SINCE = 2020;
  const sinceYear = { year: SINCE, count: years.filter((y) => y !== null && y >= SINCE).length };

  const dated = active.filter((s) => s.registered).sort((a, b) => a.registered!.localeCompare(b.registered!));

  return {
    active,
    closing,
    byType: tally(active.map((s) => s.type)),
    bySector: tally(active.map((s) => s.sector)),
    byPlace,
    placeCount,
    byDecade,
    sinceYear,
    oldest: dated[0] ?? null,
  };
}

export interface SearchResult {
  total: number;
  results: SocietyHit[];
}

/**
 * Active societies anywhere in the UK whose name or sector contains `query`,
 * optionally leaving out those in one area. Names that start with the query
 * come first, then alphabetical.
 */
export function searchSocieties(query: string, opts: { exclude?: Area | null; limit?: number } = {}): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { total: 0, results: [] };
  const excluded = opts.exclude && !isNational(opts.exclude) ? inArea(opts.exclude) : () => false;
  const matches = allSocieties().filter(
    (s) =>
      isActive(s) &&
      !excluded(s) &&
      (s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q)),
  );
  const starts = (s: Society) => (s.name.toLowerCase().startsWith(q) ? 0 : 1);
  matches.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
  return {
    total: matches.length,
    results: matches.slice(0, opts.limit ?? 20).map((s) => ({
      regNo: s.regNo,
      name: s.name,
      type: s.type,
      sector: s.sector,
      district: s.district,
      region: s.region,
      registered: s.registered,
    })),
  };
}

// The register's society pages are keyed by an internal id the CSV doesn't
// carry, so link to its search for the society's name.
export function fcaSearchUrl(name: string): string {
  return `https://mutuals.fca.org.uk/Search/Search?SearchTerm=${encodeURIComponent(name)}`;
}
