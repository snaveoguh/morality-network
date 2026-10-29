// ============================================================================
// BEAROMETER — GLOBAL SUPPLY-CHAIN SCORING
// Pure: fetched series and tagged headlines in, per-indicator and per-region
// pressure out. No fetching, no LLM.
//
// Data indicator:  change = comparison(series)          (see Comparison)
//                  pressure = tanh(polarity × change / scale), −1…+1
// News indicator:  pressure = tanh(Σ sign × sourceWeight × recencyDecay / 2),
//                  the same formula and 72h half-life as the China layer.
// Region:          plain mean of its fresh indicators' pressures. No weights,
//                  so nobody has to trust a tuning choice they cannot see.
// Labels:          |pressure| < 0.25 → STEADY; stale data → STALE (not scored).
// ============================================================================

import type { SourceBias } from "../bias";
import { recencyDecay, splitPublisher } from "./supply-chain-score";
import { SOURCE_KIND_WEIGHT, type SupplyChainSourceKind } from "./supply-chain-sources";
import {
  DATA_INDICATORS,
  NEWS_INDICATORS,
  REGIONS,
  classifyDisruption,
  type Comparison,
  type DataIndicatorDef,
  type DisruptionDirection,
  type NewsIndicatorDef,
  type Region,
} from "./global-supply-taxonomy";

export const STRAIN_THRESHOLD = 0.25;
const NEWS_TANH_SCALE = 2;
const HEADLINES_PER_INDICATOR = 3;

export type GlobalLabel = "STRAINED" | "EASING" | "STEADY" | "STALE" | "NO DATA";

export interface SeriesPoint {
  /** ISO date (YYYY-MM-DD) or month (YYYY-MM). */
  date: string;
  value: number;
}

export interface DataReading {
  def: DataIndicatorDef;
  label: GlobalLabel;
  pressure: number;
  latest: number | null;
  baseline: number | null;
  /** Fractional change for pct comparisons, points for level-vs. */
  change: number | null;
  asOf: string | null;
  stale: boolean;
}

export interface NewsHeadline {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceKind: SupplyChainSourceKind;
  bias: SourceBias | null;
  direction: DisruptionDirection;
  weight: number;
}

export interface NewsReading {
  def: NewsIndicatorDef;
  label: GlobalLabel;
  pressure: number;
  itemCount: number;
  disruptingCount: number;
  easingCount: number;
  headlines: NewsHeadline[];
}

export interface RegionReading {
  region: Region;
  label: GlobalLabel;
  /** Mean of fresh indicator pressures; 0 when none scored. */
  pressure: number;
  scoredCount: number;
  data: DataReading[];
  news: NewsReading[];
}

export function labelFor(pressure: number): GlobalLabel {
  if (pressure >= STRAIN_THRESHOLD) return "STRAINED";
  if (pressure <= -STRAIN_THRESHOLD) return "EASING";
  return "STEADY";
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** latest, baseline and change for one comparison; null when the series is too short. */
export function compareSeries(
  points: SeriesPoint[],
  compare: Comparison,
): { latest: number; baseline: number; change: number } | null {
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const latest = values[values.length - 1];

  let baseline: number;
  switch (compare.kind) {
    case "level-vs":
      return { latest, baseline: compare.reference, change: latest - compare.reference };
    case "pct-vs-first":
      if (values.length < 2) return null;
      baseline = values[0];
      break;
    case "pct-vs-lag":
      if (values.length <= compare.lag) return null;
      baseline = values[values.length - 1 - compare.lag];
      break;
    case "pct-vs-mean": {
      // Needs at least half the window so a thin series does not pass as a full one.
      const prior = values.slice(Math.max(0, values.length - 1 - compare.window), -1);
      if (prior.length < Math.ceil(compare.window / 2)) return null;
      baseline = mean(prior);
      break;
    }
  }
  if (baseline === 0) return null;
  return { latest, baseline, change: (latest - baseline) / Math.abs(baseline) };
}

function ageDays(date: string, now: number): number {
  // Monthly dates ("2026-09") are taken as the month's last day: data for
  // September is not stale on 1 October.
  const ts = /^\d{4}-\d{2}$/.test(date)
    ? Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)
    : Date.parse(date);
  return Number.isFinite(ts) ? (now - ts) / 86_400_000 : Infinity;
}

export function scoreDataIndicator(
  def: DataIndicatorDef,
  points: SeriesPoint[] | null,
  now: number,
): DataReading {
  const empty: DataReading = {
    def,
    label: "NO DATA",
    pressure: 0,
    latest: null,
    baseline: null,
    change: null,
    asOf: null,
    stale: false,
  };
  if (!points || points.length === 0) return empty;

  const result = compareSeries(points, def.compare);
  if (!result) return { ...empty, asOf: points[points.length - 1].date };

  const asOf = points[points.length - 1].date;
  const stale = ageDays(asOf, now) > def.maxAgeDays;
  const pressure = Math.tanh((def.polarity * result.change) / def.compare.scale);
  return {
    def,
    label: stale ? "STALE" : labelFor(pressure),
    pressure,
    latest: result.latest,
    baseline: result.baseline,
    change: result.change,
    asOf,
    stale,
  };
}

// ── News ──────────────────────────────────────────────────────────────────

export interface RawGlobalNewsItem {
  indicatorId: string;
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  sourceKind: SupplyChainSourceKind;
  bias?: SourceBias | null;
}

const DIRECTION_SIGN: Record<DisruptionDirection, number> = { disrupting: 1, easing: -1, neutral: 0 };

function dedupeKey(headline: string): string {
  return headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function scoreNewsIndicator(def: NewsIndicatorDef, items: RawGlobalNewsItem[], now: number): NewsReading {
  const byKey = new Map<string, NewsHeadline>();
  for (const item of items) {
    if (item.indicatorId !== def.id) continue;
    const { headline } = splitPublisher(item.title);
    const text = `${headline} ${item.description}`;
    if (!def.patterns.some((pattern) => pattern.test(text))) continue;
    const decay = recencyDecay(item.pubDate, now);
    if (decay === null) continue;

    const tagged: NewsHeadline = {
      id: item.id,
      title: headline,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source,
      sourceKind: item.sourceKind,
      bias: item.bias ?? null,
      direction: classifyDisruption(text),
      weight: SOURCE_KIND_WEIGHT[item.sourceKind] * decay,
    };
    const key = dedupeKey(headline);
    const existing = byKey.get(key);
    if (!existing || tagged.weight > existing.weight) byKey.set(key, tagged);
  }

  const tagged = [...byKey.values()];
  const net = tagged.reduce((sum, h) => sum + DIRECTION_SIGN[h.direction] * h.weight, 0);
  const pressure = Math.tanh(net / NEWS_TANH_SCALE);
  return {
    def,
    label: tagged.length === 0 ? "NO DATA" : labelFor(pressure),
    pressure,
    itemCount: tagged.length,
    disruptingCount: tagged.filter((h) => h.direction === "disrupting").length,
    easingCount: tagged.filter((h) => h.direction === "easing").length,
    // Directional items first, then most recent.
    headlines: tagged
      .sort((a, b) => {
        const directional = Number(b.direction !== "neutral") - Number(a.direction !== "neutral");
        return directional || Date.parse(b.pubDate) - Date.parse(a.pubDate);
      })
      .slice(0, HEADLINES_PER_INDICATOR),
  };
}

// ── Regions ───────────────────────────────────────────────────────────────

function scored(reading: DataReading | NewsReading): boolean {
  return reading.label !== "STALE" && reading.label !== "NO DATA";
}

export function scoreRegions(
  seriesById: Record<string, SeriesPoint[] | null>,
  newsItems: RawGlobalNewsItem[],
  now: number,
): RegionReading[] {
  const data = DATA_INDICATORS.map((def) => scoreDataIndicator(def, seriesById[def.id] ?? null, now));
  const news = NEWS_INDICATORS.map((def) => scoreNewsIndicator(def, newsItems, now));

  return REGIONS.map((region) => {
    const regionData = data.filter((r) => r.def.region === region.id);
    const regionNews = news.filter((r) => r.def.region === region.id);
    const pressures = [...regionData, ...regionNews].filter(scored).map((r) => r.pressure);
    const pressure = pressures.length > 0 ? mean(pressures) : 0;
    return {
      region,
      label: pressures.length > 0 ? labelFor(pressure) : "NO DATA",
      pressure,
      scoredCount: pressures.length,
      data: regionData,
      news: regionNews,
    };
  });
}
