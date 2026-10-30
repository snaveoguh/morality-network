import { NEWS_INDICATORS } from "./global-supply-taxonomy";
import type { SupplyChainSource } from "./supply-chain-sources";

// ============================================================================
// BEAROMETER — GLOBAL SUPPLY-CHAIN NEWS SWEEPS
// One Google News query per region, 7-day window, through fetchFeed() like
// the China wire sweeps. A single OR query across regions returns only the
// loudest story, so each region gets its own (same lesson as China, 2026-10-28).
// Items carry the real publisher in the title suffix; BIAS_DATABASE labels it.
// ============================================================================

export interface GlobalNewsSource extends SupplyChainSource {
  indicatorId: string;
}

function googleNews(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export const GLOBAL_NEWS_SOURCES: GlobalNewsSource[] = NEWS_INDICATORS.map((def) => ({
  name: `Wire sweep: ${def.label}`,
  kind: "aggregator",
  category: "SupplyChain",
  indicatorId: def.id,
  url: googleNews(`${def.query} when:7d`),
}));
