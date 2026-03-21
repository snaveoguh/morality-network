// Stumble — random discovery engine
// Feeds a "StumbleUpon-style" mix of creative sites, videos, music, and discussions.

export type StumbleType =
  | "article"
  | "video"
  | "image"
  | "discussion"
  | "wiki"
  | "tool"
  | "music";

export interface StumbleItem {
  id: string;
  type: StumbleType;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  source: string;
  sourceIcon: string;
  score: number; // engagement/upvotes
  commentCount: number;
  author?: string;
  subreddit?: string;
  timestamp: string;
}

interface CuratedSeed {
  type: StumbleType;
  title: string;
  description: string;
  url: string;
  source: string;
  sourceIcon: string;
  imageUrl?: string;
}

const REDDIT_ICON =
  "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png";
const HN_ICON = "https://news.ycombinator.com/y18.svg";
const WIKI_ICON = "https://en.wikipedia.org/static/apple-touch/wikipedia.png";
const YT_ICON = "https://www.youtube.com/s/desktop/aa57fb97/img/favicon_144x144.png";
const CHROME_ICON = "https://www.google.com/chrome/static/images/chrome-logo.svg";
const WEB_ICON = "https://www.google.com/s2/favicons?sz=128&domain=";

const CURATED_SEEDS: CuratedSeed[] = [
  {
    type: "tool",
    title: "Neal.fun",
    description: "Playful, weird interactive explainers and internet toys.",
    url: "https://neal.fun/",
    source: "Neal.fun",
    sourceIcon: `${WEB_ICON}neal.fun`,
  },
  {
    type: "tool",
    title: "WindowSwap",
    description: "Teleport to random windows around the world.",
    url: "https://www.window-swap.com/Window",
    source: "WindowSwap",
    sourceIcon: `${WEB_ICON}window-swap.com`,
  },
  {
    type: "tool",
    title: "Patatap",
    description: "Create music + visuals instantly from your keyboard.",
    url: "https://patatap.com/",
    source: "Patatap",
    sourceIcon: `${WEB_ICON}patatap.com`,
  },
  {
    type: "music",
    title: "Chrome Music Lab — Song Maker",
    description: "Compose quick melodies in your browser.",
    url: "https://musiclab.chromeexperiments.com/Song-Maker/",
    source: "Chrome Experiments",
    sourceIcon: CHROME_ICON,
  },
  {
    type: "tool",
    title: "Earth Nullschool",
    description: "Live global wind, weather, and ocean visualization.",
    url: "https://earth.nullschool.net/",
    source: "nullschool",
    sourceIcon: `${WEB_ICON}earth.nullschool.net`,
  },
  {
    type: "tool",
    title: "Radio Garden",
    description: "Spin the globe and listen to live radio stations worldwide.",
    url: "https://radio.garden/",
    source: "Radio Garden",
    sourceIcon: `${WEB_ICON}radio.garden`,
  },
  {
    type: "image",
    title: "This Person Does Not Exist",
    description: "A fresh AI-generated face every refresh.",
    url: "https://thispersondoesnotexist.com/",
    source: "TPDNE",
    sourceIcon: `${WEB_ICON}thispersondoesnotexist.com`,
  },
  {
    type: "video",
    title: "Kurzgesagt — The Last Human",
    description: "A cinematic science explainer to kick off a stumble session.",
    url: "https://www.youtube.com/watch?v=LEENEFaVUzU",
    source: "YouTube",
    sourceIcon: YT_ICON,
    imageUrl: "https://i.ytimg.com/vi/LEENEFaVUzU/hqdefault.jpg",
  },
  {
    type: "video",
    title: "NPR Tiny Desk Concerts",
    description: "Live performances, great for background while browsing.",
    url: "https://www.youtube.com/watch?v=3Q4L5R5lWvE",
    source: "YouTube",
    sourceIcon: YT_ICON,
    imageUrl: "https://i.ytimg.com/vi/3Q4L5R5lWvE/hqdefault.jpg",
  },
  {
    type: "music",
    title: "NTS Radio",
    description: "Independent internet radio with deep cuts and DJ sets.",
    url: "https://www.nts.live/",
    source: "NTS",
    sourceIcon: `${WEB_ICON}nts.live`,
  },
  {
    type: "tool",
    title: "A Soft Murmur",
    description: "Ambient noise mixer for focus and writing sessions.",
    url: "https://asoftmurmur.com/",
    source: "A Soft Murmur",
    sourceIcon: `${WEB_ICON}asoftmurmur.com`,
  },
  {
    type: "tool",
    title: "Pointer Pointer",
    description: "Completely pointless and still perfect internet energy.",
    url: "https://pointerpointer.com/",
    source: "Pointer Pointer",
    sourceIcon: `${WEB_ICON}pointerpointer.com`,
  },
];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function compactDescription(value: string | null | undefined, max = 260): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

export function normalizeStumbleUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    const removable = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "ref_src",
      "fbclid",
      "gclid",
    ];
    for (const key of removable) u.searchParams.delete(key);
    u.hash = "";

    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function getEmbeddableUrl(rawUrl: string): string {
  const normalized = normalizeStumbleUrl(rawUrl);
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
    }

    if (host.endsWith("youtube.com")) {
      const watchId = u.searchParams.get("v");
      if (watchId) return `https://www.youtube.com/embed/${watchId}?rel=0`;
      const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shorts?.[1]) return `https://www.youtube.com/embed/${shorts[1]}?rel=0`;
    }

    if (host.endsWith("vimeo.com")) {
      const match = u.pathname.match(/\/(\d+)/);
      if (match?.[1]) return `https://player.vimeo.com/video/${match[1]}`;
    }

    if (host.endsWith("soundcloud.com")) {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalized)}&auto_play=false`;
    }
  } catch {
    // fall through to original
  }
  return normalized;
}

const INLINE_EMBED_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "soundcloud.com",
  "musiclab.chromeexperiments.com",
  "neal.fun",
  "window-swap.com",
  "patatap.com",
  "earth.nullschool.net",
  "radio.garden",
  "thispersondoesnotexist.com",
  "asoftmurmur.com",
  "pointerpointer.com",
  "nts.live",
];

export function canRenderStumbleInline(rawUrl: string): boolean {
  const normalized = normalizeStumbleUrl(rawUrl);
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    return INLINE_EMBED_HOSTS.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    );
  } catch {
    return false;
  }
}

export function isDirectImageUrl(rawUrl: string): boolean {
  const normalized = normalizeStumbleUrl(rawUrl);
  return /\.(avif|gif|jpe?g|png|webp|svg)(?:\?.*)?$/i.test(normalized);
}

function buildCuratedItems(): StumbleItem[] {
  return shuffle(CURATED_SEEDS).map((seed, idx) => ({
    id: `curated-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    type: seed.type,
    title: seed.title,
    description: seed.description,
    url: normalizeStumbleUrl(seed.url),
    imageUrl: seed.imageUrl,
    source: seed.source,
    sourceIcon: seed.sourceIcon,
    score: 0,
    commentCount: 0,
    timestamp: new Date().toISOString(),
  }));
}

// ============================================================================
// REDDIT — trending/viral posts (no API key needed)
// ============================================================================

async function fetchRedditTrending(): Promise<StumbleItem[]> {
  try {
    const subreddits = [
      "popular",
      "all",
      "videos",
      "interestingasfuck",
      "todayilearned",
      "worldnews",
      "science",
      "technology",
      "music",
      "internetisbeautiful",
      "futurology",
      "ethereum",
    ];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];

    const sorts = ["hot", "top"];
    const sort = sorts[Math.floor(Math.random() * sorts.length)];
    const timeParam = sort === "top" ? "&t=day" : "";

    const res = await fetch(
      `https://www.reddit.com/r/${sub}/${sort}.json?limit=20${timeParam}`,
      {
        headers: { "User-Agent": "MO-Network/2.0" },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;

    return (data.data?.children || [])
      .filter((c: any) => c.data && !c.data.over_18 && !c.data.stickied)
      .map((c: any) => {
        const d = c.data;
        const isVideo =
          d.is_video ||
          d.domain?.includes("youtube") ||
          d.domain?.includes("youtu.be") ||
          d.post_hint === "hosted:video";
        const isImage =
          d.post_hint === "image" ||
          /\.(jpg|jpeg|png|gif|webp)$/i.test(d.url || "");

        return {
          id: `reddit-${d.id}`,
          type: isVideo ? "video" : isImage ? "image" : "article",
          title: d.title || "Untitled",
          description: compactDescription(d.selftext, 300),
          url: normalizeStumbleUrl(
            d.url_overridden_by_dest || d.url || `https://reddit.com${d.permalink}`,
          ),
          imageUrl: isImage
            ? d.url
            : d.thumbnail && d.thumbnail !== "self" && d.thumbnail !== "default"
              ? d.thumbnail
              : d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&"),
          source: `r/${d.subreddit}`,
          sourceIcon: REDDIT_ICON,
          score: d.score || 0,
          commentCount: d.num_comments || 0,
          author: d.author,
          subreddit: d.subreddit,
          timestamp: new Date(d.created_utc * 1000).toISOString(),
        } as StumbleItem;
      });
  } catch (error) {
    console.error("Reddit fetch failed:", error);
    return [];
  }
}

// ============================================================================
// HACKER NEWS — top/best stories (free, no key)
// ============================================================================

async function fetchHNStories(): Promise<StumbleItem[]> {
  try {
    const endpoints = ["topstories", "beststories", "showstories"];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const idsRes = await fetch(
      `https://hacker-news.firebaseio.com/v0/${endpoint}.json`,
      { next: { revalidate: 300 } },
    );
    if (!idsRes.ok) return [];
    const ids = (await idsRes.json()) as number[];

    const shuffled = shuffle(ids.slice(0, 60));
    const selected = shuffled.slice(0, 12);

    const stories = await Promise.all(
      selected.map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          next: { revalidate: 300 },
        });
        if (!res.ok) return null;
        return res.json();
      }),
    );

    return stories
      .filter((s): s is any => s && s.title && !s.dead && !s.deleted)
      .map((s) => ({
        id: `hn-${s.id}`,
        type: "discussion" as const,
        title: s.title,
        description: compactDescription(s.text, 300),
        url: normalizeStumbleUrl(s.url || `https://news.ycombinator.com/item?id=${s.id}`),
        source: "Hacker News",
        sourceIcon: HN_ICON,
        score: s.score || 0,
        commentCount: s.descendants || 0,
        author: s.by,
        timestamp: new Date(s.time * 1000).toISOString(),
      }));
  } catch (error) {
    console.error("HN fetch failed:", error);
    return [];
  }
}

// ============================================================================
// WIKIPEDIA — random articles
// ============================================================================

async function fetchWikipediaRandom(): Promise<StumbleItem[]> {
  try {
    const res = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=6&format=json&origin=*",
      { next: { revalidate: 0 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;

    return (data.query?.random || []).map((article: any) => ({
      id: `wiki-${article.id}`,
      type: "wiki" as const,
      title: article.title,
      description: `Random Wikipedia page: ${article.title}`,
      url: normalizeStumbleUrl(
        `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, "_"))}`,
      ),
      source: "Wikipedia",
      sourceIcon: WIKI_ICON,
      score: 0,
      commentCount: 0,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("Wikipedia fetch failed:", error);
    return [];
  }
}

function dedupeByUrl(items: StumbleItem[]): StumbleItem[] {
  const seen = new Set<string>();
  const out: StumbleItem[] = [];

  for (const item of items) {
    const normalizedUrl = normalizeStumbleUrl(item.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    out.push({ ...item, url: normalizedUrl });
  }
  return out;
}

// ============================================================================
// AGGREGATOR
// ============================================================================

export async function fetchStumbleContent(): Promise<StumbleItem[]> {
  const results = await Promise.allSettled([
    Promise.resolve(buildCuratedItems()),
    fetchRedditTrending(),
    fetchHNStories(),
    fetchWikipediaRandom(),
  ]);

  const all: StumbleItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }

  return shuffle(dedupeByUrl(all));
}

export async function getRandomStumbleItem(): Promise<StumbleItem | null> {
  const items = await fetchStumbleContent();
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}
