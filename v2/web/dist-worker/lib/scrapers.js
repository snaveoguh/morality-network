"use strict";
// ============================================================================
// SCRAPERS — Reddit + 4chan feed integration
// Returns FeedItem[] compatible with the main RSS pipeline
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchRedditFeeds = fetchRedditFeeds;
exports.fetchChanFeeds = fetchChanFeeds;
const bias_1 = require("./bias");
const REDDIT_SUBREDDITS = [
    // ─── NEWS / POLITICS ───
    { name: "r/worldnews", sub: "worldnews", category: "World" },
    { name: "r/news", sub: "news", category: "World" },
    { name: "r/politics", sub: "politics", category: "Politics" },
    { name: "r/geopolitics", sub: "geopolitics", category: "World" },
    { name: "r/UpliftingNews", sub: "UpliftingNews", category: "World" },
    // ─── BUSINESS / FINANCE ───
    { name: "r/economics", sub: "economics", category: "Business" },
    { name: "r/wallstreetbets", sub: "wallstreetbets", category: "Business" },
    { name: "r/stocks", sub: "stocks", category: "Business" },
    // ─── CRYPTO ───
    { name: "r/CryptoCurrency", sub: "CryptoCurrency", category: "Crypto" },
    { name: "r/ethereum", sub: "ethereum", category: "Crypto" },
    { name: "r/defi", sub: "defi", category: "Crypto" },
    // ─── TECH ───
    { name: "r/technology", sub: "technology", category: "Tech" },
    { name: "r/programming", sub: "programming", category: "Tech" },
    { name: "r/artificial", sub: "artificial", category: "Tech" },
    // ─── SCIENCE ───
    { name: "r/science", sub: "science", category: "Science" },
    { name: "r/space", sub: "space", category: "Science" },
];
/**
 * Fetch top posts from a single subreddit.
 * Returns FeedItem[] matching the RSS feed format.
 */
async function fetchSubreddit(config, limit = 10) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(`https://www.reddit.com/r/${config.sub}/hot.json?limit=${limit}&raw_json=1`, {
            headers: { "User-Agent": "PooterWorld/2.0" },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok)
            return [];
        const data = await res.json();
        const bias = (0, bias_1.getSourceBias)("reddit.com");
        return (data.data?.children || [])
            .filter((c) => c.data &&
            !c.data.over_18 &&
            !c.data.stickied &&
            !c.data.is_self && // skip self-posts (no external link)
            c.data.url)
            .slice(0, limit)
            .map((c) => {
            const d = c.data;
            // Use the external link if it's a link post, otherwise the reddit permalink
            const link = d.url_overridden_by_dest || d.url || `https://reddit.com${d.permalink}`;
            // Try to get a thumbnail/preview image
            let imageUrl;
            if (d.preview?.images?.[0]?.source?.url) {
                imageUrl = d.preview.images[0].source.url;
            }
            else if (d.thumbnail &&
                d.thumbnail !== "self" &&
                d.thumbnail !== "default" &&
                d.thumbnail !== "nsfw" &&
                d.thumbnail !== "spoiler") {
                imageUrl = d.thumbnail;
            }
            const feedItem = {
                id: `reddit-${d.id}`,
                title: d.title || "Untitled",
                link,
                description: (d.selftext || "").slice(0, 300),
                pubDate: new Date(d.created_utc * 1000).toISOString(),
                source: config.name,
                sourceUrl: `https://www.reddit.com/r/${config.sub}`,
                category: config.category,
                imageUrl,
                bias: bias ? { ...bias } : null,
            };
            return feedItem;
        });
    }
    catch (error) {
        console.error(`[Reddit:${config.name}] Failed:`, error instanceof Error ? error.message : error);
        return [];
    }
}
/**
 * Fetch top posts from all configured subreddits.
 * Fetches in parallel with a slight stagger to avoid rate limits.
 */
async function fetchRedditFeeds() {
    const results = await Promise.allSettled(REDDIT_SUBREDDITS.map((sub) => fetchSubreddit(sub, 8)));
    const items = [];
    for (const result of results) {
        if (result.status === "fulfilled") {
            items.push(...result.value);
        }
    }
    return items;
}
const CHAN_BOARDS = [
    { name: "/pol/ - Politics", board: "pol", category: "Politics" },
    { name: "/biz/ - Business", board: "biz", category: "Business" },
    { name: "/news/ - News", board: "news", category: "World" },
    { name: "/g/ - Technology", board: "g", category: "Tech" },
    { name: "/sci/ - Science", board: "sci", category: "Science" },
];
/**
 * Strip 4chan HTML (greentext, quotes, links, breaks) to plain text.
 */
function stripChanHtml(html) {
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
async function fetchChanBoard(config, limit = 8) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(`https://a.4cdn.org/${config.board}/catalog.json`, {
            headers: { "User-Agent": "PooterWorld/2.0" },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok)
            return [];
        const pages = await res.json();
        // Take threads from the first 2 pages (most active)
        const threads = [];
        for (const page of pages.slice(0, 2)) {
            threads.push(...page.threads);
        }
        // Sort by replies (most active threads first)
        threads.sort((a, b) => b.replies - a.replies);
        const bias = (0, bias_1.getSourceBias)("4chan.org");
        return threads.slice(0, limit).map((thread) => {
            const title = thread.sub
                ? stripChanHtml(thread.sub)
                : thread.com
                    ? stripChanHtml(thread.com).slice(0, 80)
                    : `Thread #${thread.no}`;
            const description = thread.com ? stripChanHtml(thread.com) : "";
            // Thumbnail: 4chan stores thumbnails as {tim}s.jpg on i.4cdn.org
            let imageUrl;
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
            };
        });
    }
    catch (error) {
        console.error(`[4chan:${config.name}] Failed:`, error instanceof Error ? error.message : error);
        return [];
    }
}
/**
 * Fetch top threads from all configured 4chan boards.
 * All boards fetched in parallel — catalog endpoint is lightweight.
 */
async function fetchChanFeeds() {
    const results = await Promise.allSettled(CHAN_BOARDS.map((board) => fetchChanBoard(board, 6)));
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
