// The existing co-op economy of an area, from the committed FCA register
// snapshot. Pure functions over the snapshot; no network or DB.

import areasJson from "@/data/coops/areas.json";
import sussexJson from "@/data/coops/sussex.json";
import type { Area, EconomySnapshot, Society } from "./types";

const AREAS = areasJson as Record<string, Area>;
const SNAPSHOTS: Record<string, EconomySnapshot> = {
  sussex: sussexJson as EconomySnapshot,
};

export function getArea(slug: string): Area | null {
  return AREAS[slug] ?? null;
}

export function listAreas(): Area[] {
  return Object.values(AREAS);
}

export function getSnapshot(slug: string): EconomySnapshot | null {
  return SNAPSHOTS[slug] ?? null;
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
  byDistrict: Tally[];
  byDecade: Tally[];
  sinceYear: { year: number; count: number };
  oldest: Society | null;
}

export function economyStats(snapshot: EconomySnapshot, area: Area): EconomyStats {
  const active = snapshot.societies.filter(isActive);
  const closing = snapshot.societies.filter((s) => isOnRegister(s) && !isActive(s));

  const districtCounts = new Map(tally(active.map((s) => s.district)).map((t) => [t.label, t.count]));
  const byDistrict = area.districts
    .map((d) => ({ label: d.name, count: districtCounts.get(d.name) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

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
    byDistrict,
    byDecade,
    sinceYear,
    oldest: dated[0] ?? null,
  };
}

// The register's society pages are keyed by an internal id the CSV doesn't
// carry, so link to its search for the society's name.
export function fcaSearchUrl(name: string): string {
  return `https://mutuals.fca.org.uk/Search/Search?SearchTerm=${encodeURIComponent(name)}`;
}
