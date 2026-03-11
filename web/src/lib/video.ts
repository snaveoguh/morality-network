// ============================================================================
// VIDEO FEED — Daily video embeds from YouTube news channels
// Uses YouTube RSS feeds (free, no API key) to surface today's top videos.
// ============================================================================

export interface VideoItem {
  id: string;              // YouTube video ID
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  pubDate: string;         // ISO date string
  url: string;             // full YouTube watch URL
  embedUrl: string;        // YouTube embed URL
  category: string;
}

// YouTube channel IDs → RSS feeds via https://www.youtube.com/feeds/videos.xml?channel_id=XXX
const VIDEO_CHANNELS = [
  // ── News / Current Affairs ──
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN",              category: "World" },
  { channelId: "UCeY0bbntWzzVIaj2z3QigXg", name: "NBC News",         category: "World" },
  { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", name: "ABC News",         category: "World" },
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News",         category: "World" },
  { channelId: "UCIRYBXDze5krPDzAEOxFGVA", name: "Channel 4 News",   category: "World" },
  { channelId: "UCknLrEdhRCp1aegoMqRaCZg", name: "Al Jazeera",       category: "World" },
  { channelId: "UCef1-8eOpJgud7szVPlZQAQ", name: "DW News",          category: "World" },
  { channelId: "UCGy6uV7yqGWDeUWTZzT3ZEg", name: "Sky News",        category: "World" },

  // ── Tech / Crypto ──
  { channelId: "UCvjgXvBlCQM4gY8Fy4FRBaQ", name: "Bankless",         category: "Crypto" },
  { channelId: "UC9K5JbEMOqFDW3nlG_v3GBA", name: "Coin Bureau",      category: "Crypto" },
  { channelId: "UCRvqjQPSeaWn-uEx-w0XOIg", name: "Marques Brownlee",  category: "Tech" },
  { channelId: "UC0RhatS1pyxInC00YKjjBqQ", name: "Fireship",         category: "Tech" },
  { channelId: "UCLXo7UDZvByw2ixzpQCufnA", name: "Vox",              category: "World" },

  // ── Science / Environment ──
  { channelId: "UCsXVk37bltHxD1rDPwtNM8Q", name: "Kurzgesagt",       category: "Science" },
  { channelId: "UC6nSFpj9HTCZ5t-N3Rm3-HA", name: "Vsauce",           category: "Science" },

  // ── Independent / Investigative ──
  { channelId: "UCvlj0IzjSnNoRrn-L6xJtWA", name: "Novara Media",     category: "Politics" },
  { channelId: "UCWPQB43jLNjKUbmyQDkG5Lw", name: "Triggernometry",   category: "Politics" },
];

// Parse YouTube RSS XML to extract video entries
function parseYouTubeRSS(xml: string, channelName: string, channelId: string, category: string): VideoItem[] {
  const items: VideoItem[] = [];

  // Extract <entry> elements
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1]
      ?.replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];

    if (!videoId || !title || !published) continue;

    items.push({
      id: videoId,
      title,
      channel: channelName,
      channelId,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      pubDate: published,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      category,
    });
  }

  return items;
}

/**
 * Fetch latest videos from all configured YouTube channels.
 * Returns max `limit` videos, sorted by most recent, from the last 48 hours.
 */
export async function fetchDailyVideos(limit = 8): Promise<VideoItem[]> {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago

  const results = await Promise.allSettled(
    VIDEO_CHANNELS.map(async (ch) => {
      try {
        const res = await fetch(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`,
          { next: { revalidate: 600 } } // 10 min cache
        );
        if (!res.ok) return [];
        const xml = await res.text();
        return parseYouTubeRSS(xml, ch.name, ch.channelId, ch.category);
      } catch {
        return [];
      }
    })
  );

  const allVideos: VideoItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allVideos.push(...result.value);
    }
  }

  // Filter to recent videos, sort newest first, take limit
  return allVideos
    .filter((v) => new Date(v.pubDate).getTime() > cutoff)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, limit);
}
