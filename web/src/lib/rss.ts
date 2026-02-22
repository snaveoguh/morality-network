import Parser from "rss-parser";
import { getSourceBias, type SourceBias } from "./bias";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "PooterWorld/1.0",
  },
});

export interface FeedSource {
  name: string;
  url: string;
  category: string;
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
}

// ============================================================================
// DEFAULT FEEDS — 40+ sources across the political spectrum
// Curated for diversity: independent, nonprofit, public, corporate, global
// ============================================================================

export const DEFAULT_FEEDS: FeedSource[] = [
  // ─── WIRE SERVICES (Center, highest factuality) ───
  { name: "Reuters",           url: "https://feedx.net/rss/reuters.xml",                           category: "World" },
  { name: "Associated Press",  url: "https://feedx.net/rss/ap.xml",                               category: "World" },

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
  // Current Affairs — RSS discontinued

  // ─── LEAN-RIGHT / RIGHT ───
  { name: "Reason",            url: "https://reason.com/feed/",                                    category: "World" },
  { name: "The American Conservative", url: "https://www.theamericanconservative.com/feed/",       category: "World" },
  // The Spectator — RSS discontinued
  { name: "Free Beacon",       url: "https://freebeacon.com/feed/",                                category: "World" },

  // ─── GLOBAL / INTERNATIONAL ───
  { name: "Al Jazeera",        url: "https://www.aljazeera.com/xml/rss/all.xml",                   category: "World" },
  { name: "France 24",         url: "https://www.france24.com/en/rss",                             category: "World" },
  { name: "DW News",           url: "https://rss.dw.com/rdf/rss-en-all",                          category: "World" },
  { name: "ABC Australia",     url: "https://www.abc.net.au/news/feed/2942460/rss.xml",            category: "World" },
  { name: "Rest of World",     url: "https://restofworld.org/feed/",                               category: "World" },
  { name: "SCMP",              url: "https://www.scmp.com/rss/91/feed",                            category: "World" },

  // ─── TECH ───
  { name: "TechCrunch",        url: "https://techcrunch.com/feed/",                                category: "Tech" },
  { name: "Hacker News",       url: "https://hnrss.org/frontpage",                                 category: "Tech" },
  { name: "Ars Technica",      url: "https://feeds.arstechnica.com/arstechnica/index",             category: "Tech" },

  // ─── CRYPTO / WEB3 ───
  { name: "CoinDesk",          url: "https://www.coindesk.com/arc/outboundfeeds/rss/",             category: "Crypto" },
  { name: "The Block",         url: "https://www.theblock.co/rss.xml",                             category: "Crypto" },
  { name: "Decrypt",           url: "https://decrypt.co/feed",                                     category: "Crypto" },
  { name: "Blockworks",        url: "https://blockworks.co/feed",                                  category: "Crypto" },
  // DL News — RSS has malformed XML

  // ─── CONFLICT / INDEPENDENT JOURNALISM ───
  { name: "Popular Front",     url: "https://popularfront.libsyn.com/rss",                         category: "World" },
];

// ============================================================================
// FETCHERS
// ============================================================================

export async function fetchFeed(source: FeedSource): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
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

      return {
        id,
        title: item.title || "Untitled",
        link: item.link || "",
        description: stripHtml(item.contentSnippet || item.content || ""),
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        source: source.name,
        sourceUrl: source.url,
        category: source.category,
        imageUrl: extractImageUrl(item),
        bias: bias ? { ...bias } : null, // ensure plain object for serialization
      };
    });
  } catch (error) {
    console.error(`Failed to fetch feed ${source.name}:`, error);
    return [];
  }
}

export async function fetchAllFeeds(
  sources: FeedSource[] = DEFAULT_FEEDS
): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    sources.map((source) => fetchFeed(source))
  );

  const items: FeedItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  // Sort by date, newest first
  items.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  return items;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim().slice(0, 300);
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
