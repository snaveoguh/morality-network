// ============================================================================
// SCRAPERS — Reddit + 4chan feed integration
// Returns FeedItem[] compatible with the main RSS pipeline
// ============================================================================

import { getSourceBias } from "./bias";
import type { FeedItem } from "./rss";

// ============================================================================
// REDDIT — fetch top posts from curated subreddits as FeedItems
// Uses old.reddit.com Atom/RSS feeds (NOT the JSON API).
// Reddit blocks cloud-provider IPs (Vercel, AWS, etc.) from the JSON API
// but the RSS feeds on old.reddit.com still work reliably.
// ============================================================================

interface RedditSubreddit {
  name: string;
  sub: string;
  category: string;
}

const REDDIT_SUBREDDITS: RedditSubreddit[] = [
  // ─── NEWS / POLITICS ───
  { name: "r/worldnews",       sub: "worldnews",       category: "World" },
  { name: "r/news",            sub: "news",            category: "World" },
  { name: "r/politics",        sub: "politics",        category: "Politics" },
  { name: "r/geopolitics",     sub: "geopolitics",     category: "World" },
  { name: "r/UpliftingNews",   sub: "UpliftingNews",   category: "World" },

  // ─── BUSINESS / FINANCE ───
  { name: "r/economics",       sub: "economics",       category: "Business" },
  { name: "r/wallstreetbets",  sub: "wallstreetbets",  category: "Business" },
  { name: "r/stocks",          sub: "stocks",          category: "Business" },

  // ─── CRYPTO ───
  { name: "r/CryptoCurrency",  sub: "CryptoCurrency",  category: "Crypto" },
  { name: "r/ethereum",        sub: "ethereum",        category: "Crypto" },
  { name: "r/defi",            sub: "defi",            category: "Crypto" },

  // ─── TECH ───
  { name: "r/technology",      sub: "technology",      category: "Tech" },
  { name: "r/programming",     sub: "programming",     category: "Tech" },
  { name: "r/artificial",      sub: "artificial",      category: "Tech" },

  // ─── SCIENCE ───
  { name: "r/science",         sub: "science",         category: "Science" },
  { name: "r/space",           sub: "space",           category: "Science" },
];

/**
 * Strip Reddit HTML content to plain text description.
 */
function stripRedditHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Extract external link from Reddit Atom entry content.
 * Reddit entries contain [link] anchors pointing to the actual article.
 */
function extractExternalLink(content: string, permalink: string): string {
  // Look for the [link] anchor — it points to the external article
  const linkMatch = content.match(/href="([^"]+)"[^>]*>\[link\]/);
  if (linkMatch?.[1]) {
    const decoded = linkMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    // Skip if it's just the reddit self-post link
    if (!decoded.includes("old.reddit.com") && !decoded.includes("reddit.com/r/")) {
      return decoded;
    }
  }
  return permalink;
}

/**
 * Extract thumbnail from Reddit Atom entry content.
 * Reddit entries embed img tags for thumbnails in the content HTML.
 */
function extractThumbnail(content: string): string | undefined {
  const imgMatch = content.match(/<img\s+src="([^"]+)"/);
  if (imgMatch?.[1]) {
    const url = imgMatch[1].replace(/&amp;/g, "&");
    if (url.startsWith("http")) return url;
  }
  return undefined;
}

/**
 * Parse Reddit Atom XML into entries without a full XML parser.
 * Reddit's Atom feeds are simple enough to parse with regex.
 */
function parseRedditAtom(xml: string): Array<{
  id: string;
  title: string;
  link: string;
  content: string;
  published: string;
  author: string;
}> {
  const entries: Array<{
    id: string;
    title: string;
    link: string;
    content: string;
    published: string;
    author: string;
  }> = [];

  // Split on <entry> tags
  const entryBlocks = xml.split("<entry>");
  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i].split("</entry>")[0];

    const idMatch = block.match(/<id>([^<]*)<\/id>/);
    const titleMatch = block.match(/<title>([^<]*)<\/title>/);
    const linkMatch = block.match(/<link\s+href="([^"]+)"/);
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const publishedMatch = block.match(/<published>([^<]*)<\/published>/);
    const authorMatch = block.match(/<name>([^<]*)<\/name>/);

    if (titleMatch) {
      entries.push({
        id: idMatch?.[1] || `entry-${i}`,
        title: titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'"),
        link: linkMatch?.[1] || "",
        content: contentMatch?.[1] || "",
        published: publishedMatch?.[1] || new Date().toISOString(),
        author: authorMatch?.[1] || "",
      });
    }
  }

  return entries;
}

/**
 * Fetch top posts from a single subreddit via RSS/Atom feed.
 * Uses old.reddit.com which is not blocked from cloud IPs.
 */
async function fetchSubreddit(
  config: RedditSubreddit,
  limit = 10,
): Promise<FeedItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(
      `https://old.reddit.com/r/${config.sub}/.rss?limit=${limit}`,
      {
        headers: { "User-Agent": "PooterWorld/2.0" },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) return [];
    const xml = await res.text();

    const entries = parseRedditAtom(xml);
    const bias = getSourceBias("reddit.com");

    return entries
      .filter((entry) => {
        // Skip stickied/megathread posts (usually mod posts)
        const author = entry.author.toLowerCase();
        return !author.includes("automoderator") && !author.endsWith("mods");
      })
      .slice(0, limit)
      .map((entry) => {
        const permalink = entry.link;
        const link = extractExternalLink(entry.content, permalink);
        const imageUrl = extractThumbnail(entry.content);
        const description = stripRedditHtml(entry.content);

        const feedItem: FeedItem = {
          id: `reddit-${entry.id}`,
          title: entry.title || "Untitled",
          link,
          description,
          pubDate: entry.published,
          source: config.name,
          sourceUrl: `https://www.reddit.com/r/${config.sub}`,
          category: config.category,
          imageUrl,
          bias: bias ? { ...bias } : null,
        };

        return feedItem;
      });
  } catch (error) {
    console.error(
      `[Reddit:${config.name}] Failed:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * Fetch top posts from all configured subreddits.
 * Fetches in parallel — RSS feeds are lightweight.
 */
export async function fetchRedditFeeds(): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    REDDIT_SUBREDDITS.map((sub) => fetchSubreddit(sub, 8)),
  );

  const items: FeedItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }

  return items;
}

// ============================================================================
// 4CHAN — fetch threads from curated boards
// Uses 4chan's public JSON API (https://github.com/4chan/4chan-API)
// No auth needed, no rate limit documented (be respectful: 1 req/sec)
// ============================================================================

interface ChanBoard {
  name: string;
  board: string;
  category: string;
}

const CHAN_BOARDS: ChanBoard[] = [
  { name: "/pol/ - Politics",    board: "pol",  category: "Politics" },
  { name: "/biz/ - Business",    board: "biz",  category: "Business" },
  { name: "/news/ - News",       board: "news", category: "World" },
  { name: "/g/ - Technology",    board: "g",    category: "Tech" },
  { name: "/sci/ - Science",     board: "sci",  category: "Science" },
];

interface ChanThread {
  no: number;
  sub?: string;     // subject
  com?: string;     // comment HTML
  time: number;     // unix timestamp
  replies: number;
  images: number;
  tim?: number;     // image timestamp (for thumbnail)
  ext?: string;     // image extension (.jpg, .png, etc.)
  semantic_url?: string;
}

/**
 * Strip 4chan HTML (greentext, quotes, links, breaks) to plain text.
 */
function stripChanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<wbr\s*\/?>/gi, "")
    .replace(/<a[^>]*class="quotelink"[^>]*>[^<]*<\/a>/gi, "")
    .replace(/<span[^>]*class="quote"[^>]*>(.*?)<\/span>/gi, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Fetch top threads from a single 4chan board using the catalog endpoint.
 * The catalog returns all threads grouped by page — we take the first page.
 */
async function fetchChanBoard(
  config: ChanBoard,
  limit = 8,
): Promise<FeedItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(
      `https://a.4cdn.org/${config.board}/catalog.json`,
      {
        headers: { "User-Agent": "PooterWorld/2.0" },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!res.ok) return [];
    const pages: Array<{ threads: ChanThread[] }> = await res.json();

    // Take threads from the first 2 pages (most active)
    const threads: ChanThread[] = [];
    for (const page of pages.slice(0, 2)) {
      threads.push(...page.threads);
    }

    // Sort by replies (most active threads first)
    threads.sort((a, b) => b.replies - a.replies);

    const bias = getSourceBias("4chan.org");

    return threads.slice(0, limit).map((thread) => {
      const title =
        thread.sub
          ? stripChanHtml(thread.sub)
          : thread.com
            ? stripChanHtml(thread.com).slice(0, 80)
            : `Thread #${thread.no}`;

      const description = thread.com ? stripChanHtml(thread.com) : "";

      // Thumbnail: 4chan stores thumbnails as {tim}s.jpg on i.4cdn.org
      let imageUrl: string | undefined;
      if (thread.tim && thread.ext) {
        imageUrl = `https://i.4cdn.org/${config.board}/${thread.tim}s.jpg`;
      }

      return {
        id: `chan-${config.board}-${thread.no}`,
        title,
        link: `https://boards.4chan.org/${config.board}/thread/${thread.no}`,
        description,
        pubDate: new Date(thread.time * 1000).toISOString(),
        source: config.name,
        sourceUrl: `https://boards.4chan.org/${config.board}/`,
        category: config.category,
        imageUrl,
        bias: bias ? { ...bias } : null,
      } as FeedItem;
    });
  } catch (error) {
    console.error(
      `[4chan:${config.name}] Failed:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * Fetch top threads from all configured 4chan boards.
 * All boards fetched in parallel — catalog endpoint is lightweight.
 */
export async function fetchChanFeeds(): Promise<FeedItem[]> {
  const results = await Promise.allSettled(
    CHAN_BOARDS.map((board) => fetchChanBoard(board, 6)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
