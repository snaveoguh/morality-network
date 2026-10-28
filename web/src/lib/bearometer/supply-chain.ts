import "server-only";

import { getSourceBias } from "../bias";
import { fetchFeed } from "../rss";
import {
  scoreGroups,
  splitPublisher,
  tagItems,
  type RawSupplyChainItem,
  type SupplyChainSnapshot,
} from "./supply-chain-score";
import { SUPPLY_CHAIN_SOURCES } from "./supply-chain-sources";

// ============================================================================
// BEAROMETER — SUPPLY-CHAIN SNAPSHOT
// Fetch → tag → score, cached in-process. Deterministic: no LLM calls, so
// nothing here can touch the AI budget (see docs/BEAROMETER_SUPPLY_CHAIN.md
// for the gated LLM upgrade that is not built yet).
// ============================================================================

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { snapshot: SupplyChainSnapshot; ts: number } | null = null;
let inflight: Promise<SupplyChainSnapshot> | null = null;

async function buildSnapshot(): Promise<SupplyChainSnapshot> {
  const results = await Promise.allSettled(
    SUPPLY_CHAIN_SOURCES.map(async (source) => ({ source, items: await fetchFeed(source) })),
  );

  const raw: RawSupplyChainItem[] = [];
  const sourcesOk: string[] = [];
  const sourcesEmpty: string[] = [];

  results.forEach((result, index) => {
    const source = SUPPLY_CHAIN_SOURCES[index];
    if (result.status !== "fulfilled" || result.value.items.length === 0) {
      sourcesEmpty.push(source.name);
      return;
    }
    sourcesOk.push(source.name);
    for (const item of result.value.items) {
      // Aggregator items carry their real publisher in the title suffix.
      const publisher = source.kind === "aggregator" ? splitPublisher(item.title).publisher : null;
      raw.push({
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

  const tagged = tagItems(raw, Date.now());
  return {
    generatedAt: new Date().toISOString(),
    indicators: scoreGroups(tagged),
    itemsScanned: raw.length,
    itemsTagged: tagged.length,
    sourcesOk,
    sourcesEmpty,
  };
}

export async function getSupplyChainSnapshot(): Promise<SupplyChainSnapshot> {
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
