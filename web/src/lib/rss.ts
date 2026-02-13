import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "MoralityNetwork/2.0",
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
}

export const DEFAULT_FEEDS: FeedSource[] = [
  { name: "Reuters", url: "https://feeds.reuters.com/reuters/topNews", category: "World" },
  { name: "BBC News", url: "http://feeds.bbci.co.uk/news/rss.xml", category: "World" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Tech" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", category: "Tech" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Crypto" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml", category: "Crypto" },
  { name: "Decrypt", url: "https://decrypt.co/feed", category: "Crypto" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "Tech" },
];

export async function fetchFeed(source: FeedSource): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items || []).slice(0, 20).map((item) => ({
      id: item.guid || item.link || `${source.name}-${item.title}`,
      title: item.title || "Untitled",
      link: item.link || "",
      description: stripHtml(item.contentSnippet || item.content || ""),
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      source: source.name,
      sourceUrl: source.url,
      category: source.category,
      imageUrl: extractImageUrl(item),
    }));
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
