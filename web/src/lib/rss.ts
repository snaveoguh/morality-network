import Parser from "rss-parser";
import { getSourceBias, type SourceBias } from "./bias";
import { fetchRedditFeeds, fetchChanFeeds } from "./scrapers";
import { extractCanonicalClaim } from "./claim-extract";

const parser = new Parser({
  timeout: 5000,
  headers: {
    "User-Agent": "PooterWorld/1.0",
  },
});

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const FALLBACK_TRIGGER_CODES = new Set([403, 404]);
const RETRY_BACKOFF_MS = [500];          // single retry, fast backoff
const FEED_TIMEOUT_MS = 5_000;           // 5s per source (was 10s)

export interface FeedSource {
  name: string;
  url: string;
  category: string;
  fallbackUrl?: string;
}

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  sourceUrl: string;
  category: string;
  imageUrl?: string;
  bias?: SourceBias | null;
  tags?: string[];
  canonicalClaim?: string;
  sourceNames?: string[];
  rawArticleCount?: number;
  eventHash?: `0x${string}`;
}

// ============================================================================
// KEYWORD PATTERNS — auto-tag articles by scanning title + description
// Each key is a tag name, value is a regex pattern (case-insensitive)
// ============================================================================

export const KEYWORD_PATTERNS: Record<string, RegExp> = {
  war:       /\b(war|invasion|airstrike|missile|bombing|troops|military|ceasefire|frontline|casualt|shelling|drone strike|combat|battlefield)\b/i,
  election:  /\b(election|ballot|poll(s|ing)?|voter|campaign|candidate|primary|caucus|inaugurat|runoff|referendum|midterm)\b/i,
  crypto:    /\b(crypto|bitcoin|btc|ethereum|eth|blockchain|defi|nft|web3|token|stablecoin|altcoin|dao|solana|airdrop|memecoin)\b/i,
  climate:   /\b(climate|global warming|carbon|emissions|renewable|fossil fuel|greenhouse|sea level|wildfire|drought|net.?zero|paris agreement)\b/i,
  ai:        /\b(artificial intelligence|\bai\b|machine learning|deep learning|llm|chatgpt|openai|anthropic|neural net|generative ai|large language model)\b/i,
  trade:     /\b(tariff|trade war|sanctions|import|export|trade deal|trade deficit|wto|free trade|protectionism|embargo)\b/i,
  health:    /\b(pandemic|vaccine|covid|virus|outbreak|who\b|public health|disease|epidemic|fda|clinical trial|pharma|mental health)\b/i,
  scandal:   /\b(scandal|corruption|fraud|bribe|indictment|coverup|whistleblow|investigation|probe|allegation|misconduct|impeach)\b/i,
  economy:   /\b(inflation|recession|gdp|interest rate|federal reserve|central bank|unemployment|jobs report|stock market|wall street|economic)\b/i,
  energy:    /\b(oil|opec|natural gas|nuclear|solar|wind farm|pipeline|energy crisis|electricity|grid|petroleum)\b/i,
  rights:    /\b(human rights|protest|civil rights|freedom|censorship|asylum|refugee|migrant|discrimination|lgbtq|abortion|privacy)\b/i,
  security:  /\b(cybersecurity|hack|breach|surveillance|espionage|intelligence|nato|terrorism|extremism|radicalis)\b/i,
  nature:    /\b(biodiversity|species|wildlife|conservation|deforestation|coral reef|rainforest|endangered|ecosystem|habitat|ocean|marine|pollution|plastic)\b/i,
};

// ============================================================================
// SOURCE TIERS — used for deduplication priority
// Higher tier = preferred when same story appears from multiple sources
// ============================================================================

type SourceTier = "wire" | "broadsheet" | "tabloid" | "blog";

const SOURCE_TIER_MAP: Record<string, SourceTier> = {
  "Reuters": "wire",
  "Associated Press": "wire",
  "AFP / France 24": "wire",
  "BBC News": "broadsheet",
  "NPR": "broadsheet",
  "The Guardian": "broadsheet",
  "The Atlantic": "broadsheet",
  "Financial Times": "broadsheet",
  "Bloomberg": "broadsheet",
  "Wall Street Journal": "broadsheet",
  "Al Jazeera": "broadsheet",
  "DW News": "broadsheet",
  "NHK World": "broadsheet",
  "Times of India": "broadsheet",
  "Nature": "broadsheet",
  "ProPublica": "broadsheet",
  "Bellingcat": "broadsheet",
  "Politico": "broadsheet",
  "The Hill": "broadsheet",
  // Environment
  "Mongabay": "broadsheet",
  "Yale E360": "broadsheet",
  "Guardian Environment": "broadsheet",
  "Inside Climate News": "broadsheet",
  "Grist": "broadsheet",
  // Government / Institutional
  "UN News": "wire",
  "WHO News": "wire",
  "GAO Reports": "broadsheet",
  "CBO Publications": "broadsheet",
  "World Bank Blogs": "broadsheet",
  "IMF Blog": "broadsheet",
  "OECD Newsroom": "broadsheet",
};

const TIER_PRIORITY: Record<SourceTier, number> = {
  wire: 4,
  broadsheet: 3,
  tabloid: 2,
  blog: 1,
};

function getSourceTier(sourceName: string): SourceTier {
  return SOURCE_TIER_MAP[sourceName] || "tabloid";
}

// ============================================================================
// DEFAULT FEEDS — 70+ sources across the political spectrum
// Curated for diversity: independent, nonprofit, public, corporate, global
// ============================================================================

export const DEFAULT_FEEDS: FeedSource[] = [
  // ─── WIRE SERVICES (Center, highest factuality) ───
  { name: "Reuters",           url: "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en", category: "World" },
  { name: "Associated Press",  url: "https://feedx.net/rss/ap.xml",                               category: "World",  fallbackUrl: "https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en" },
  { name: "Associated Press (Top)", url: "https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en-US&gl=US&ceid=US:en", category: "World" },
  { name: "AFP / France 24",   url: "https://www.france24.com/en/rss",                             category: "World" },

  // ─── CENTER / LEAN-LEFT NEWS ───
  { name: "BBC News",          url: "http://feeds.bbci.co.uk/news/rss.xml",                        category: "World" },
  { name: "NPR",               url: "https://feeds.npr.org/1001/rss.xml",                          category: "World" },
  { name: "The Guardian",      url: "https://www.theguardian.com/world/rss",                       category: "World" },
  { name: "The Atlantic",      url: "https://www.theatlantic.com/feed/all/",                       category: "World" },

  // ─── INVESTIGATIVE / NONPROFIT ───
  { name: "ProPublica",        url: "https://www.propublica.org/feeds/propublica/main",            category: "World" },
  { name: "The Intercept",     url: "https://theintercept.com/feed/?rss",                          category: "World" },
  { name: "Bellingcat",        url: "https://www.bellingcat.com/feed/",                            category: "World" },
  // OCCRP — no working public RSS as of 2026

  // ─── LEFT / FAR-LEFT ───
  { name: "Democracy Now!",    url: "https://www.democracynow.org/democracynow.rss",               category: "World" },
  { name: "Jacobin",           url: "https://jacobin.com/feed",                                    category: "World" },
  { name: "Mother Jones",      url: "https://www.motherjones.com/feed/",                           category: "World" },
  { name: "Vox",               url: "https://www.vox.com/rss/index.xml",                           category: "Politics" },
  { name: "The Canary",        url: "https://www.thecanary.co/feed/",                              category: "Politics" },
  // Current Affairs — RSS discontinued

  // ─── LEAN-RIGHT / RIGHT ───
  { name: "Reason",            url: "https://reason.com/feed/",                                    category: "World" },
  { name: "The American Conservative", url: "https://www.theamericanconservative.com/feed/",       category: "World" },
  { name: "The Spectator",     url: "https://news.google.com/rss/search?q=site:spectator.co.uk+when:7d&hl=en-GB&gl=GB&ceid=GB:en", category: "Politics" },
  { name: "Free Beacon",       url: "https://freebeacon.com/feed/",                                category: "World" },
  { name: "Guido Fawkes",      url: "https://order-order.com/feed/",                               category: "Politics" },
  { name: "Breitbart",         url: "https://feeds.feedburner.com/breitbart",                      category: "Politics" },
  { name: "Daily Wire",        url: "https://www.dailywire.com/feeds/rss.xml",                     category: "Politics" },

  // ─── UK POLITICS ───
  { name: "New Statesman",     url: "https://www.newstatesman.com/feed",                           category: "Politics" },

  // ─── US POLITICS ───
  { name: "Politico",          url: "https://rss.politico.com/politics-news.xml",                  category: "Politics" },
  { name: "The Hill",          url: "https://thehill.com/feed/",                                   category: "Politics" },

  // ─── GLOBAL / INTERNATIONAL ───
  { name: "Al Jazeera",        url: "https://www.aljazeera.com/xml/rss/all.xml",                   category: "World" },
  // France 24 covered above as "AFP / France 24"
  { name: "DW News",           url: "https://rss.dw.com/rdf/rss-en-all",                          category: "World" },
  { name: "ABC Australia",     url: "https://www.abc.net.au/news/feed/2942460/rss.xml",            category: "World" },
  { name: "SCMP",              url: "https://www.scmp.com/rss/91/feed",                            category: "World" },
  { name: "NHK World",         url: "https://www3.nhk.or.jp/rss/news/cat0.xml",                   category: "World" },
  { name: "Times of India",    url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",  category: "World" },
  { name: "Kyiv Independent",  url: "https://news.google.com/rss/search?q=site:kyivindependent.com+when:1d&hl=en-US&gl=US&ceid=US:en", category: "World" },
  { name: "Middle East Eye",   url: "https://www.middleeasteye.net/rss",                           category: "World" },

  // ─── BUSINESS / FINANCE ───
  { name: "Financial Times",   url: "https://www.ft.com/rss/home",                                category: "Business" },
  { name: "Bloomberg",         url: "https://feeds.bloomberg.com/markets/news.rss",                category: "Business" },
  { name: "Wall Street Journal", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",            category: "Business" },
  { name: "CNBC",              url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",       category: "Business" },
  { name: "MarketWatch",       url: "https://feeds.marketwatch.com/marketwatch/topstories",        category: "Business" },

  // ─── TECH ───
  { name: "TechCrunch",        url: "https://techcrunch.com/feed/",                                category: "Tech" },
  { name: "Hacker News",       url: "https://hnrss.org/frontpage",                                 category: "Tech" },
  { name: "Ars Technica",      url: "https://feeds.arstechnica.com/arstechnica/index",             category: "Tech" },
  { name: "The Verge",         url: "https://www.theverge.com/rss/index.xml",                      category: "Tech" },
  { name: "Wired",             url: "https://www.wired.com/feed/rss",                              category: "Tech" },
  { name: "Rest of World",     url: "https://restofworld.org/feed/",                               category: "Tech" },

  // ─── CRYPTO / WEB3 ───
  { name: "CoinDesk",          url: "https://www.coindesk.com/arc/outboundfeeds/rss/",             category: "Crypto" },
  { name: "The Block",         url: "https://www.theblock.co/rss.xml",                             category: "Crypto" },
  { name: "Decrypt",           url: "https://decrypt.co/feed",                                     category: "Crypto" },
  { name: "Blockworks",        url: "https://blockworks.co/feed",                                  category: "Crypto" },
  { name: "The Defiant",       url: "https://thedefiant.io/feed",                                  category: "Crypto" },
  { name: "DL News",           url: "https://news.google.com/rss/search?q=site:dlnews.com+when:1d&hl=en-US&gl=US&ceid=US:en", category: "Crypto" },
  { name: "Cointelegraph",     url: "https://cointelegraph.com/rss",                               category: "Crypto" },

  // ─── SCIENCE ───
  { name: "Nature",            url: "https://www.nature.com/nature.rss",                           category: "Science" },
  { name: "New Scientist",     url: "https://www.newscientist.com/feed/home",                      category: "Science" },

  // ─── ENVIRONMENT / NATURE ───
  { name: "Carbon Brief",      url: "https://www.carbonbrief.org/feed",                            category: "Environment" },
  { name: "Mongabay",          url: "https://news.mongabay.com/feed/",                             category: "Environment" },
  { name: "Yale E360",         url: "https://news.google.com/rss/search?q=site:e360.yale.edu+when:7d&hl=en-US&gl=US&ceid=US:en", category: "Environment" },
  { name: "Guardian Environment", url: "https://www.theguardian.com/environment/rss",              category: "Environment" },
  { name: "Earth.org",         url: "https://earth.org/feed/",                                     category: "Environment" },
  { name: "Inside Climate News", url: "https://insideclimatenews.org/feed/",                       category: "Environment" },
  { name: "Grist",             url: "https://grist.org/feed/",                                     category: "Environment" },

  // ─── GOVERNMENT / INSTITUTIONAL ───
  { name: "UN News",           url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",      category: "Governance" },
  { name: "WHO News",          url: "https://www.who.int/rss-feeds/news-english.xml",              category: "Governance" },
  { name: "World Bank Blogs",  url: "https://news.google.com/rss/search?q=site:blogs.worldbank.org+when:7d&hl=en-US&gl=US&ceid=US:en", category: "Governance" },
  { name: "IMF Blog",          url: "https://news.google.com/rss/search?q=site:imf.org/en/Blogs+when:7d&hl=en-US&gl=US&ceid=US:en", category: "Governance" },
  { name: "GAO Reports",       url: "https://www.gao.gov/rss/reports.xml",                         category: "Governance" },
  { name: "CBO Publications",  url: "https://news.google.com/rss/search?q=site:cbo.gov+when:7d&hl=en-US&gl=US&ceid=US:en", category: "Governance" },
  { name: "OECD Newsroom",     url: "https://news.google.com/rss/search?q=site:oecd.org+newsroom+when:7d&hl=en-US&gl=US&ceid=US:en", category: "Governance" },

  // ─── CONFLICT / INDEPENDENT JOURNALISM ───
  { name: "Popular Front",     url: "https://popularfront.libsyn.com/rss",                         category: "World" },
];

// ============================================================================
// FETCHERS
// ============================================================================

export async function fetchFeed(source: FeedSource): Promise<FeedItem[]> {
  try {
    let feed: Parser.Output<Parser.Item>;
    try {
      const xml = await fetchFeedXmlWithRetry(source, 1);
      feed = await parser.parseString(xml);
    } catch {
      // Fallback for sources that only work via parser's internal transport.
      feed = await parser.parseURL(source.url);
    }

    const bias = getSourceBias(source.url) || getSourceBias(source.name);

    return (feed.items || []).slice(0, 15).map((item) => {
      // guid can be a string or an object {$: {isPermaLink: "true"}, _: "..."} — normalize
      let id = item.link || `${source.name}-${item.title}`;
      if (typeof item.guid === "string") {
        id = item.guid;
      } else if (item.guid && typeof item.guid === "object") {
        // rss-parser sometimes returns guid as { _: "value" } or similar
        const g = item.guid as Record<string, unknown>;
        if (typeof g._ === "string") id = g._;
        else if (typeof g.$ === "object" && g.$) id = String((g.$ as Record<string, unknown>).url || id);
      }

      const feedItem: FeedItem = {
        id,
        title: item.title || "Untitled",
        link: item.link || "",
        description: stripHtml(item.contentSnippet || item.content || ""),
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        source: source.name,
        sourceUrl: source.url,
        category: source.category,
        imageUrl: extractImageUrl(item as Parser.Item & Record<string, unknown>),
        bias: bias ? { ...bias } : null, // ensure plain object for serialization
        canonicalClaim: extractCanonicalClaim({
          title: item.title || "",
          description: stripHtml(item.contentSnippet || item.content || ""),
          url: item.link || "",
        }),
      };
      // Auto-assign keyword tags from title + description
      const tags = autoAssignTags(feedItem);
      if (tags.length > 0) feedItem.tags = tags;
      return feedItem;
    });
  } catch (error) {
    console.error(
      `[RSS:${source.name}] Failed to fetch feed:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

// ============================================================================
// IN-MEMORY CACHE — avoid re-fetching 70+ feeds within the same request cycle
// TTL is short (5 min) — just prevents duplicate work in a single page render
// where both AsyncFeed and getDailyEdition call fetchAllFeeds().
// ============================================================================

let feedCache: { items: FeedItem[]; ts: number } | null = null;
const FEED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Fetch an array of promises in batches to avoid overwhelming serverless connections. */
async function batchSettled<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

export async function fetchAllFeeds(
  sources: FeedSource[] = DEFAULT_FEEDS
): Promise<FeedItem[]> {
  // Return cached if fresh
  if (feedCache && Date.now() - feedCache.ts < FEED_CACHE_TTL_MS) {
    console.log(`[RSS] Serving ${feedCache.items.length} items from cache`);
    return feedCache.items;
  }

  // Fetch RSS in batches of 15 to avoid overwhelming serverless connections,
  // plus Reddit and 4chan scrapers in parallel
  const [rssResults, redditItems, chanItems] = await Promise.all([
    batchSettled(
      sources.map((source) => () => fetchFeed(source)),
      15,
    ),
    fetchRedditFeeds().catch((err) => {
      console.error("[Scrapers] Reddit fetch failed:", err);
      return [] as FeedItem[];
    }),
    fetchChanFeeds().catch((err) => {
      console.error("[Scrapers] 4chan fetch failed:", err);
      return [] as FeedItem[];
    }),
  ]);

  const items: FeedItem[] = [];
  for (const result of rssResults) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  // Add scraped items — auto-tag them like RSS items
  for (const item of [...redditItems, ...chanItems]) {
    const tags = autoAssignTags(item);
    if (tags.length > 0) item.tags = tags;
    if (!item.canonicalClaim) {
      item.canonicalClaim = extractCanonicalClaim({
        title: item.title,
        description: item.description,
        url: item.link,
      });
    }
    items.push(item);
  }

  // Deduplicate across sources (prefer wire > broadsheet > tabloid > blog)
  const deduped = deduplicateItems(items);

  // Sort by date, newest first
  deduped.sort((a, b) => parseTimestamp(b.pubDate) - parseTimestamp(a.pubDate));

  // Cache results
  feedCache = { items: deduped, ts: Date.now() };

  return deduped;
}

// ============================================================================
// AUTO-TAGGING — scan title + description and assign relevant tags
// ============================================================================

function autoAssignTags(item: FeedItem): string[] {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const tags: string[] = [];
  for (const [tag, pattern] of Object.entries(KEYWORD_PATTERNS)) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }
  return tags;
}

// ============================================================================
// DEDUPLICATION — remove duplicate stories across sources
// Keeps the item from the highest-tier source (wire > broadsheet > tabloid > blog)
// Dedupes by: (1) normalized title prefix, (2) exact link URL
// ============================================================================

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")   // strip punctuation
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim()
    .slice(0, 60);
}

function deduplicateItems(items: FeedItem[]): FeedItem[] {
  // Pass 1: dedupe by exact link URL
  const byLink = new Map<string, FeedItem>();
  for (const item of items) {
    if (!item.link) {
      // Items without links can't be deduped by URL — keep them
      byLink.set(item.id, item);
      continue;
    }
    const normLink = normalizeLink(item.link);

    const existing = byLink.get(normLink);
    if (!existing) {
      byLink.set(normLink, item);
    } else {
      // Keep higher-tier source
      const existingPriority = TIER_PRIORITY[getSourceTier(existing.source)];
      const newPriority = TIER_PRIORITY[getSourceTier(item.source)];
      if (newPriority > existingPriority) {
        byLink.set(normLink, item);
      }
    }
  }

  // Pass 2: dedupe by normalized title prefix
  const byTitle = new Map<string, FeedItem>();
  for (const item of byLink.values()) {
    const normTitle = normalizeTitle(item.title);
    if (!normTitle) {
      byTitle.set(item.id, item);
      continue;
    }
    const existing = byTitle.get(normTitle);
    if (!existing) {
      byTitle.set(normTitle, item);
    } else {
      // Keep higher-tier source; on tie, keep the newer one
      const existingPriority = TIER_PRIORITY[getSourceTier(existing.source)];
      const newPriority = TIER_PRIORITY[getSourceTier(item.source)];
      if (newPriority > existingPriority) {
        byTitle.set(normTitle, item);
      } else if (newPriority === existingPriority) {
        // Same tier — keep the more recent item
        const existingDate = parseTimestamp(existing.pubDate);
        const newDate = parseTimestamp(item.pubDate);
        if (newDate > existingDate) {
          byTitle.set(normTitle, item);
        }
      }
    }
  }

  return Array.from(byTitle.values());
}

// ============================================================================
// HELPERS
// ============================================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim().slice(0, 300);
}

function parseTimestamp(value: string): number {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeLink(link: string): string {
  try {
    const url = new URL(link);
    url.hash = "";

    const trackingParams = [
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "ref",
      "ref_src",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term",
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const search = url.searchParams.toString();
    return `${host}${path}${search ? `?${search}` : ""}`;
  } catch {
    return link
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }
}

async function fetchXmlFromUrl(
  url: string,
  sourceName: string,
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PooterWorld/1.0" },
        signal: controller.signal,
      });

      if (res.ok) {
        return await res.text();
      }

      // 403/404 are not retryable — surface immediately so fallback logic can kick in
      if (FALLBACK_TRIGGER_CODES.has(res.status)) {
        throw new FallbackError(`HTTP ${res.status}`, res.status);
      }

      const canRetry = RETRYABLE_STATUS_CODES.has(res.status);
      if (!canRetry || attempt === maxRetries) {
        throw new Error(`HTTP ${res.status}`);
      }

      const delay = RETRY_BACKOFF_MS[attempt] ?? 2000;
      console.warn(
        `[RSS:${sourceName}] ${res.status}, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      // Let FallbackError propagate immediately — no retry
      if (error instanceof FallbackError) {
        throw error;
      }

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        throw error;
      }
      const delay = RETRY_BACKOFF_MS[attempt] ?? 2000;
      console.warn(
        `[RSS:${sourceName}] fetch error, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`[RSS:${sourceName}] retries exhausted`);
}

/** Sentinel error for 403/404 that should trigger fallback URL */
class FallbackError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "FallbackError";
  }
}

async function fetchFeedXmlWithRetry(
  source: FeedSource,
  maxRetries = 3
): Promise<string> {
  try {
    const xml = await fetchXmlFromUrl(source.url, source.name, maxRetries);
    return xml;
  } catch (error) {
    // If the primary URL returned 403/404 and we have a fallback, try it
    if (error instanceof FallbackError && source.fallbackUrl) {
      console.warn(
        `[RSS:${source.name}] Primary URL returned ${error.statusCode}, trying fallback: ${source.fallbackUrl}`
      );
      try {
        const xml = await fetchXmlFromUrl(source.fallbackUrl, `${source.name}:fallback`, maxRetries);
        console.log(
          `[RSS:${source.name}] Fallback URL succeeded: ${source.fallbackUrl}`
        );
        return xml;
      } catch (fallbackError) {
        console.error(
          `[RSS:${source.name}] Fallback URL also failed:`,
          fallbackError instanceof Error ? fallbackError.message : fallbackError
        );
        // Re-throw the original error for clarity
        throw error;
      }
    }
    throw error;
  }
}

function extractImageUrl(
  item: Parser.Item & Record<string, unknown>
): string | undefined {
  // Try common RSS image fields
  if (item.enclosure?.url) return item.enclosure.url;

  const mediaContent = item["media:content"] as
    | { $?: { url?: string } }
    | undefined;
  if (mediaContent?.$?.url) return mediaContent.$.url;

  const mediaThumbnail = item["media:thumbnail"] as
    | { $?: { url?: string } }
    | undefined;
  if (mediaThumbnail?.$?.url) return mediaThumbnail.$.url;

  // Try to extract first image from content
  const content = (item.content || "") as string;
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
  if (imgMatch) return imgMatch[1];

  return undefined;
}
