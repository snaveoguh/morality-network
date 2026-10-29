import { getSourceTier, type FeedItem, type SourceTier } from "./rss";
import { tagGroups } from "./bearometer/supply-chain-taxonomy";
import { computeEntityHash } from "./entity";
import { hasStyleErrors, lintCopy, tidyHeadline } from "./house-style";

// ============================================================================
// IMPACT SCORE — which of today's stories matter most, for the header ticker
//
// Deterministic and free: no model call. Feed items are clustered by title
// overlap, then each cluster is scored:
//
//   score = coverage × recency × source × category × signal
//
//   coverage  1 + log2(independent outlets carrying the story)
//   recency   halves every RECENCY_HALF_LIFE_H hours from the newest report
//   source    best tier in the cluster (wire 1, broadsheet .85, other .5)
//   category  sport and culture count for less on an "important notice" line
//   signal    ×1.35 when the story touches an asset or theme the Bearometer
//             tracks (BTC, ETH, SOL, gold, DXY, S&P 500, China supply chain)
//
// The feed itself is cached in rss.ts; scores are memoised per feed array.
// ============================================================================

export const RECENCY_HALF_LIFE_H = 8;
export const MAX_AGE_H = 36;
export const SIGNAL_BOOST = 1.35;
const CLUSTER_MIN_SHARED = 2;
const CLUSTER_MIN_JACCARD = 0.3;
const HEADLINE_MAX_CHARS = 110;

const TIER_WEIGHT: Record<SourceTier, number> = { wire: 1, broadsheet: 0.85, tabloid: 0.5, blog: 0.4 };
const CATEGORY_WEIGHT: Record<string, number> = { Sport: 0.5, Culture: 0.6, Music: 0.6 };

// The assets the Bearometer leads with. Mirrors the relevant entries of
// SYMBOL_PATTERNS in lib/trading/signals.ts, narrowed for headlines (no bare
// "rates" or "stocks", which tag too much).
export const SIGNAL_ASSETS: Array<{ symbol: string; label: string; pattern: RegExp }> = [
  { symbol: "BTC", label: "BTC", pattern: /\b(bitcoin|btc)\b/i },
  { symbol: "ETH", label: "ETH", pattern: /\b(ethereum|ether)\b/i },
  { symbol: "SOL", label: "SOL", pattern: /\b(solana)\b/i },
  { symbol: "PAXG", label: "Gold", pattern: /\b(gold|bullion)\b/i },
  {
    symbol: "DXY",
    label: "DXY",
    pattern:
      /\b(dollar|treasury yields?|interest rates?|rate (?:cut|rise|hike)s?|inflation|federal reserve|fed (?:chair|holds|cuts|raises)|fomc|central bank|bank of england|ecb|tariffs?)\b/i,
  },
  { symbol: "SPX", label: "S&P 500", pattern: /\b(s&p\s*500|wall street|nasdaq|dow jones|stock markets?|equities)\b/i },
];

// Rare earths, gallium, graphite etc. move the supply-chain panel.
const SUPPLY_CHAIN_LABEL = "Supply chain";

const STOPWORDS = new Set(
  (
    "the a an and or but of to in on at for from by with as is are was were be been has have had " +
    "it its this that these those after over into than says say said new amid about up out his her " +
    "their they he she we you not will would could can may might more most who what when where why how " +
    "us uk live latest update news report reports"
  ).split(" "),
);

export interface TickerStory {
  /** Stable id: the representative item's id. */
  id: string;
  headline: string;
  href: string;
  source: string;
  /** Distinct outlets carrying the story. */
  sourceCount: number;
  score: number;
  /** Bearometer assets or themes the story touches, e.g. ["Gold", "DXY"]. */
  signals: string[];
  pubDate: string;
}

function parseTime(date: string | undefined): number {
  const t = date ? Date.parse(date) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Google News appends the outlet: "Fed holds rates - Reuters". Drop it. */
export function stripOutletSuffix(title: string, source: string): string {
  const m = /\s+[-–—|]\s+([^-–—|]{2,40})$/.exec(title.trim());
  if (!m) return title.trim();
  const tail = m[1].trim().toLowerCase();
  const src = source.toLowerCase();
  return tail === src || src.includes(tail) || tail.includes(src) ? title.trim().slice(0, m.index).trim() : title.trim();
}

/** Title → content tokens. Crude plural stripping so "tariff" ≈ "tariffs". */
export function titleTokens(title: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of title.toLowerCase().replace(/[’']s\b/g, "").split(/[^a-z0-9&]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    tokens.add(raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return tokens;
}

function similar(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared < CLUSTER_MIN_SHARED) return false;
  return shared / (a.size + b.size - shared) >= CLUSTER_MIN_JACCARD;
}

/** Group items that report the same story (single-link on title overlap). */
export function clusterItems(items: FeedItem[]): FeedItem[][] {
  const tokens = items.map((i) => titleTokens(stripOutletSuffix(i.title, i.source)));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (find(i) !== find(j) && similar(tokens[i], tokens[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, FeedItem[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(item);
    else groups.set(root, [item]);
  });
  return [...groups.values()];
}

/** Bearometer assets/themes a piece of text touches. */
export function signalTags(text: string): string[] {
  const tags = SIGNAL_ASSETS.filter((a) => a.pattern.test(text)).map((a) => a.label);
  if (tagGroups(text).length > 0) tags.push(SUPPLY_CHAIN_LABEL);
  return tags;
}

/** House-style headline from the cluster, else the representative's raw title trimmed. */
export function tickerHeadline(cluster: FeedItem[], marketStory: boolean): string {
  for (const item of cluster) {
    const tidy = tidyHeadline(stripOutletSuffix(item.title, item.source));
    if (tidy && !hasStyleErrors(lintCopy(tidy, "headline", { marketStory }))) return tidy;
  }
  const raw = stripOutletSuffix(cluster[0].title, cluster[0].source).replace(/\s+/g, " ").trim();
  if (raw.length <= HEADLINE_MAX_CHARS) return raw;
  const cut = raw.slice(0, HEADLINE_MAX_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 60)).trim()}…`;
}

export function scoreCluster(cluster: FeedItem[], now: number): { score: number; signals: string[] } {
  const outlets = new Set(cluster.map((i) => i.source));
  const newest = Math.max(...cluster.map((i) => (i.datedAtFetch ? now - 12 * 3_600_000 : parseTime(i.pubDate))));
  const ageH = Math.max(0, (now - newest) / 3_600_000);
  const coverage = 1 + Math.log2(outlets.size);
  const recency = Math.pow(0.5, ageH / RECENCY_HALF_LIFE_H);
  const source = Math.max(...cluster.map((i) => TIER_WEIGHT[getSourceTier(i.source)]));
  const category = Math.min(...cluster.map((i) => CATEGORY_WEIGHT[i.category] ?? 1));
  const signals = [...new Set(cluster.flatMap((i) => signalTags(i.title)))];
  const signal = signals.length > 0 ? SIGNAL_BOOST : 1;
  return { score: coverage * recency * source * category * signal, signals };
}

// Reddit ("r/news") and 4chan ("/pol/ - Politics") scrapes are not outlets.
const isScraped = (item: FeedItem) => /^(r\/|\/\w+\/)/.test(item.source);

/** Top stories by impact, best first. Pure given `now`. */
export function rankStories(items: FeedItem[], limit = 8, now: number = Date.now()): TickerStory[] {
  const recent = items.filter((i) => {
    if (!i.title || !i.link || isScraped(i)) return false;
    if (i.datedAtFetch) return true;
    const t = parseTime(i.pubDate);
    return t > 0 && now - t <= MAX_AGE_H * 3_600_000 && t <= now + 3_600_000;
  });

  return clusterItems(recent)
    .map((cluster) => {
      const { score, signals } = scoreCluster(cluster, now);
      // Representative: best tier, then newest.
      const ordered = [...cluster].sort(
        (a, b) =>
          TIER_WEIGHT[getSourceTier(b.source)] - TIER_WEIGHT[getSourceTier(a.source)] ||
          parseTime(b.pubDate) - parseTime(a.pubDate),
      );
      const rep = ordered[0];
      return {
        id: rep.id,
        headline: tickerHeadline(ordered, signals.length > 0),
        href: `/article/${computeEntityHash(rep.link)}`,
        source: rep.source,
        sourceCount: new Set(cluster.map((i) => i.source)).size,
        score: Math.round(score * 1000) / 1000,
        signals,
        pubDate: rep.pubDate,
      };
    })
    .sort((a, b) => b.score - a.score || parseTime(b.pubDate) - parseTime(a.pubDate))
    .slice(0, limit);
}

// Memoised per feed array: fetchAllFeeds returns the same array while its
// cache is fresh, so the ranking is computed once per feed refresh.
const rankCache = new WeakMap<FeedItem[], { ts: number; stories: TickerStory[] }>();
const RANK_TTL_MS = 5 * 60 * 1000;

export function rankStoriesCached(items: FeedItem[], limit = 8): TickerStory[] {
  const hit = rankCache.get(items);
  if (hit && Date.now() - hit.ts < RANK_TTL_MS && hit.stories.length >= limit) return hit.stories.slice(0, limit);
  const stories = rankStories(items, Math.max(limit, 8));
  rankCache.set(items, { ts: Date.now(), stories });
  return stories.slice(0, limit);
}
