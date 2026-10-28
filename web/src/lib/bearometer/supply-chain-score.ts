// ============================================================================
// BEAROMETER — SUPPLY-CHAIN INDICATOR SCORING
// Pure: tagged headlines in, per-group pressure out. No fetching, no LLM.
// pressure = tanh(Σ direction × sourceWeight × recencyDecay / 2), −1…+1.
// ============================================================================

import type { SourceBias } from "../bias";
import {
  SUPPLY_CHAIN_GROUPS,
  classifyDirection,
  tagGroups,
  type SupplyChainGroup,
  type SupplyChainGroupId,
  type SupplyDirection,
} from "./supply-chain-taxonomy";
import { SOURCE_KIND_WEIGHT, type SupplyChainSourceKind } from "./supply-chain-sources";

export const HALF_LIFE_HOURS = 72;
export const MAX_AGE_DAYS = 30;
const PRESSURE_THRESHOLD = 0.25;
const TANH_SCALE = 2;
const HEADLINES_PER_GROUP = 4;

export interface RawSupplyChainItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  sourceKind: SupplyChainSourceKind;
  bias?: SourceBias | null;
}

export interface TaggedSupplyChainItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceKind: SupplyChainSourceKind;
  bias: SourceBias | null;
  groups: SupplyChainGroupId[];
  direction: SupplyDirection;
  /** "llm" only when the gated classifier overrode a neutral regex result. */
  directionBy: "regex" | "llm";
  weight: number;
}

export type PressureLabel = "TIGHTENING" | "EASING" | "MIXED" | "QUIET";

export interface SupplyChainIndicator {
  group: SupplyChainGroup;
  label: PressureLabel;
  /** −1 (easing) … +1 (tightening) */
  pressure: number;
  /** Sum of item weights — how much is being said, regardless of direction. */
  activity: number;
  itemCount: number;
  tighteningCount: number;
  easingCount: number;
  headlines: TaggedSupplyChainItem[];
}

export interface SupplyChainSnapshot {
  generatedAt: string;
  indicators: SupplyChainIndicator[];
  itemsScanned: number;
  itemsTagged: number;
  sourcesOk: string[];
  sourcesEmpty: string[];
}

/** Google News titles end " - Publisher"; strip it for display and dedupe. */
export function splitPublisher(title: string): { headline: string; publisher: string | null } {
  const match = title.match(/^(.*\S)\s+-\s+([^-]{2,60})$/);
  if (!match) return { headline: title.trim(), publisher: null };
  return { headline: match[1], publisher: match[2].trim() };
}

function dedupeKey(headline: string): string {
  return headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function recencyDecay(pubDate: string, now: number): number | null {
  const ts = Date.parse(pubDate);
  if (!Number.isFinite(ts)) return null;
  const ageHours = Math.max(0, (now - ts) / 3_600_000);
  if (ageHours > MAX_AGE_DAYS * 24) return null;
  return Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

const DIRECTION_SIGN: Record<SupplyDirection, number> = {
  tightening: 1,
  easing: -1,
  neutral: 0,
};

export function tagItems(items: RawSupplyChainItem[], now: number): TaggedSupplyChainItem[] {
  const byKey = new Map<string, TaggedSupplyChainItem>();

  for (const item of items) {
    const { headline } = splitPublisher(item.title);
    const text = `${headline} ${item.description}`;
    const groups = tagGroups(text);
    if (groups.length === 0) continue;

    const decay = recencyDecay(item.pubDate, now);
    if (decay === null) continue;

    const tagged: TaggedSupplyChainItem = {
      id: item.id,
      title: headline,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source,
      sourceKind: item.sourceKind,
      bias: item.bias ?? null,
      groups,
      direction: classifyDirection(text),
      directionBy: "regex",
      weight: SOURCE_KIND_WEIGHT[item.sourceKind] * decay,
    };

    // Same story via two sources: keep the heavier (government beats press).
    const key = dedupeKey(headline);
    const existing = byKey.get(key);
    if (!existing || tagged.weight > existing.weight) byKey.set(key, tagged);
  }

  return [...byKey.values()].sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
}

function labelFor(pressure: number, itemCount: number): PressureLabel {
  if (itemCount === 0) return "QUIET";
  if (pressure >= PRESSURE_THRESHOLD) return "TIGHTENING";
  if (pressure <= -PRESSURE_THRESHOLD) return "EASING";
  return "MIXED";
}

export function scoreGroups(tagged: TaggedSupplyChainItem[]): SupplyChainIndicator[] {
  return SUPPLY_CHAIN_GROUPS.map((group) => {
    const items = tagged.filter((item) => item.groups.includes(group.id));
    const net = items.reduce((sum, item) => sum + DIRECTION_SIGN[item.direction] * item.weight, 0);
    const activity = items.reduce((sum, item) => sum + item.weight, 0);
    const pressure = Math.tanh(net / TANH_SCALE);

    return {
      group,
      label: labelFor(pressure, items.length),
      pressure,
      activity,
      itemCount: items.length,
      tighteningCount: items.filter((item) => item.direction === "tightening").length,
      easingCount: items.filter((item) => item.direction === "easing").length,
      // Directional items first, then most recent.
      headlines: [...items]
        .sort((a, b) => {
          const directional = Number(b.direction !== "neutral") - Number(a.direction !== "neutral");
          return directional || Date.parse(b.pubDate) - Date.parse(a.pubDate);
        })
        .slice(0, HEADLINES_PER_GROUP),
    };
  }).sort((a, b) => b.activity - a.activity);
}
