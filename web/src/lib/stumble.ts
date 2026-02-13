// Stumble — random discovery engine
// Pulls trending/random content from across the web for the Stumble tab

export interface StumbleItem {
  id: string;
  type: "article" | "video" | "image" | "discussion" | "wiki";
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

// ============================================================================
// REDDIT — trending/viral posts (no API key needed)
// ============================================================================

async function fetchRedditTrending(): Promise<StumbleItem[]> {
  try {
    const subreddits = [
      "popular", "all", "videos", "interestingasfuck",
      "todayilearned", "worldnews", "science", "technology",
      "dataisbeautiful", "space", "futurology", "ethereum",
    ];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];

    const sorts = ["hot", "top"];
    const sort = sorts[Math.floor(Math.random() * sorts.length)];
    const timeParam = sort === "top" ? "&t=day" : "";

    const res = await fetch(
      `https://www.reddit.com/r/${sub}/${sort}.json?limit=15${timeParam}`,
      {
        headers: { "User-Agent": "MO-Network/2.0" },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.data?.children || [])
      .filter((c: any) => c.data && !c.data.over_18 && !c.data.stickied)
      .map((c: any) => {
        const d = c.data;
        const isVideo = d.is_video || d.domain?.includes("youtube") || d.domain?.includes("youtu.be");
        const isImage = d.post_hint === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(d.url || "");

        return {
          id: `reddit-${d.id}`,
          type: isVideo ? "video" : isImage ? "image" : "article",
          title: d.title || "Untitled",
          description: (d.selftext || "").slice(0, 300),
          url: d.url_overridden_by_dest || d.url || `https://reddit.com${d.permalink}`,
          imageUrl: isImage
            ? d.url
            : d.thumbnail && d.thumbnail !== "self" && d.thumbnail !== "default"
              ? d.thumbnail
              : d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&"),
          source: `r/${d.subreddit}`,
          sourceIcon: "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
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
// HACKER NEWS — top/best stories (completely free, no limit)
// ============================================================================

async function fetchHNStories(): Promise<StumbleItem[]> {
  try {
    const endpoints = ["topstories", "beststories", "showstories"];
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const idsRes = await fetch(
      `https://hacker-news.firebaseio.com/v0/${endpoint}.json`,
      { next: { revalidate: 300 } }
    );
    if (!idsRes.ok) return [];
    const ids: number[] = await idsRes.json();

    // Pick 10 random from top 50
    const shuffled = ids.slice(0, 50).sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 10);

    const stories = await Promise.all(
      selected.map(async (id) => {
        const res = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          { next: { revalidate: 300 } }
        );
        if (!res.ok) return null;
        return res.json();
      })
    );

    return stories
      .filter((s): s is any => s && s.title && !s.dead && !s.deleted)
      .map((s) => ({
        id: `hn-${s.id}`,
        type: "discussion" as const,
        title: s.title,
        description: s.text?.slice(0, 300) || "",
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        source: "Hacker News",
        sourceIcon: "https://news.ycombinator.com/y18.svg",
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
// WIKIPEDIA — random + most viewed articles (completely free)
// ============================================================================

async function fetchWikipediaRandom(): Promise<StumbleItem[]> {
  try {
    const res = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=5&format=json&origin=*",
      { next: { revalidate: 0 } } // always fresh for randomness
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.query?.random || []).map((article: any) => ({
      id: `wiki-${article.id}`,
      type: "wiki" as const,
      title: article.title,
      description: `Random Wikipedia article: ${article.title}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title.replace(/ /g, "_"))}`,
      source: "Wikipedia",
      sourceIcon: "https://en.wikipedia.org/static/apple-touch/wikipedia.png",
      score: 0,
      commentCount: 0,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("Wikipedia fetch failed:", error);
    return [];
  }
}

// ============================================================================
// AGGREGATOR — merge all sources, shuffle for randomness
// ============================================================================

export async function fetchStumbleContent(): Promise<StumbleItem[]> {
  const results = await Promise.allSettled([
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

  // Shuffle for true randomness (Fisher-Yates)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all;
}

// Get a single random item
export async function getRandomStumbleItem(): Promise<StumbleItem | null> {
  const items = await fetchStumbleContent();
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}
