import type { FeedSource } from "../rss";

// ============================================================================
// BEAROMETER — CHINA SUPPLY-CHAIN SOURCES
// Most of these sites have no working RSS (MOFCOM times out, China Daily's
// RSS paths 404, SCMP 301s, Caixin 403s — checked 2026-10-28), so they go
// through Google News site: queries, the same pattern DEFAULT_FEEDS uses for
// Xinhua and Global Times. Names match BIAS_DATABASE entries so getSourceBias
// labels them (the feed URL itself resolves to news.google.com).
// ============================================================================

export type SupplyChainSourceKind = "government" | "state-media" | "independent" | "aggregator";

export interface SupplyChainSource extends FeedSource {
  kind: SupplyChainSourceKind;
}

const MATERIALS_QUERY =
  '(rare earth OR gallium OR germanium OR graphite OR antimony OR tungsten OR lithium OR Nexperia OR "export control")';

const WIRE_SWEEPS: Array<[label: string, query: string]> = [
  ["rare earths", '("rare earth" OR magnets) (export OR supply OR prices)'],
  ["gallium/germanium", "(gallium OR germanium) (export OR supply OR prices)"],
  ["graphite", "graphite (export OR anode OR supply OR prices)"],
  ["antimony/tungsten", "(antimony OR tungsten) (export OR supply OR prices)"],
  ["lithium", "(lithium OR LFP OR cathode) (export OR supply OR prices)"],
  ["legacy chips", "(Nexperia OR \"legacy chips\" OR \"mature node\") (export OR supply)"],
];

function googleNews(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export const SUPPLY_CHAIN_SOURCES: SupplyChainSource[] = [
  // Primary: the notices themselves.
  { name: "MOFCOM", kind: "government", category: "SupplyChain", url: googleNews("site:mofcom.gov.cn when:30d") },
  { name: "China Customs (GACC)", kind: "government", category: "SupplyChain", url: googleNews("site:customs.gov.cn when:60d") },
  // State media — fast to report Beijing's framing of a measure.
  { name: "Xinhua", kind: "state-media", category: "SupplyChain", url: googleNews(`site:english.news.cn ${MATERIALS_QUERY} when:30d`) },
  { name: "Global Times", kind: "state-media", category: "SupplyChain", url: googleNews(`site:globaltimes.cn ${MATERIALS_QUERY} when:30d`) },
  { name: "China Daily", kind: "state-media", category: "SupplyChain", url: googleNews(`site:chinadaily.com.cn ${MATERIALS_QUERY} when:30d`) },
  // Independent China coverage — prices, company reaction, enforcement.
  { name: "South China Morning Post", kind: "independent", category: "SupplyChain", url: googleNews(`site:scmp.com ${MATERIALS_QUERY} when:30d`) },
  { name: "Caixin Global", kind: "independent", category: "SupplyChain", url: googleNews(`site:caixinglobal.com ${MATERIALS_QUERY} when:30d`) },
  // Wire pick-ups of MOFCOM notices (Reuters, Bloomberg, trade press). One
  // sweep per group: a single OR query returned only rare-earth stories
  // (checked 2026-10-28), leaving every other group QUIET.
  ...WIRE_SWEEPS.map(([label, query]) => ({
    name: `Wire sweep: ${label}`,
    kind: "aggregator" as const,
    category: "SupplyChain",
    url: googleNews(`China ${query} when:7d`),
  })),
];

export const SOURCE_KIND_WEIGHT: Record<SupplyChainSourceKind, number> = {
  government: 1.5,
  "state-media": 1.0,
  independent: 1.0,
  aggregator: 0.8,
};
