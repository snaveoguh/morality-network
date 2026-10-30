import "server-only";

import { getSourceBias } from "../bias";
import { fetchFeed } from "../rss";
import { DATA_INDICATORS } from "./global-supply-taxonomy";
import { scoreRegions, type RawGlobalNewsItem, type RegionReading } from "./global-supply-score";
import { fetchAllSeries } from "./global-supply-fetchers";
import { GLOBAL_NEWS_SOURCES } from "./global-supply-sources";
import { recordGlobalSupplySnapshot } from "./global-supply-record";
import { splitPublisher, type SupplyChainSnapshot } from "./supply-chain-score";
import { getSupplyChainSnapshot } from "./supply-chain";

// ============================================================================
// BEAROMETER — GLOBAL SUPPLY-CHAIN SNAPSHOT
// Data series + regional news sweeps → per-region readings, with the China
// critical-minerals snapshot carried alongside unchanged. Deterministic: no
// LLM call anywhere in this path. Cached in-process for 30 minutes.
// ============================================================================

const CACHE_TTL_MS = 30 * 60 * 1000;

export interface GlobalSupplySnapshot {
  generatedAt: string;
  regions: RegionReading[];
  china: SupplyChainSnapshot;
  dataSourcesFailed: string[];
  newsSourcesEmpty: string[];
  newsItemsScanned: number;
}

let cache: { snapshot: GlobalSupplySnapshot; ts: number } | null = null;
let inflight: Promise<GlobalSupplySnapshot> | null = null;

async function fetchNews(): Promise<{ items: RawGlobalNewsItem[]; empty: string[] }> {
  const results = await Promise.allSettled(GLOBAL_NEWS_SOURCES.map((source) => fetchFeed(source)));
  const items: RawGlobalNewsItem[] = [];
  const empty: string[] = [];
  results.forEach((result, index) => {
    const source = GLOBAL_NEWS_SOURCES[index];
    if (result.status !== "fulfilled" || result.value.length === 0) {
      empty.push(source.name);
      return;
    }
    for (const item of result.value) {
      const publisher = splitPublisher(item.title).publisher;
      items.push({
        indicatorId: source.indicatorId,
        id: item.id,
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: item.pubDate,
        source: publisher ?? source.name,
        sourceKind: source.kind,
        bias: (publisher ? getSourceBias(publisher) : null) ?? item.bias ?? null,
      });
    }
  });
  return { items, empty };
}

async function buildSnapshot(): Promise<GlobalSupplySnapshot> {
  const [{ series, failed }, news, china] = await Promise.all([
    fetchAllSeries(DATA_INDICATORS),
    fetchNews(),
    getSupplyChainSnapshot(),
  ]);
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const regions = scoreRegions(series, news.items, now);
  await recordGlobalSupplySnapshot(generatedAt, regions);
  return {
    generatedAt,
    regions,
    china,
    dataSourcesFailed: failed,
    newsSourcesEmpty: news.empty,
    newsItemsScanned: news.items.length,
  };
}

export async function getGlobalSupplySnapshot(): Promise<GlobalSupplySnapshot> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.snapshot;
  if (!inflight) {
    inflight = buildSnapshot()
      .then((snapshot) => {
        cache = { snapshot, ts: Date.now() };
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
