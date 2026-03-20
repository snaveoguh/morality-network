import "server-only";

import { reportWarn } from "./report-error";
import type { FeedItem } from "./rss";
import type { PodcastEpisode, PodcastPlatformLink } from "./article";

const PODCAST_FETCH_TIMEOUT_MS = 6_000;
const PODCAST_CACHE_TTL_MS = 30 * 60 * 1000;

const podcastCache = new Map<string, { expiresAt: number; value: PodcastEpisode | null }>();

interface CneAudioData {
  title?: string;
  platforms?: Array<{ name?: string; value?: string }>;
  audios?: Array<{
    title?: string;
    summary?: string;
    duration?: number;
    pubDate?: string;
    files?: string[];
    provider?: { name?: string };
    image?: { publicUrl?: string; assets?: Record<string, { url?: string }> };
  }>;
  image?: { publicUrl?: string; assets?: Record<string, { url?: string }> };
}

export async function extractPodcastEpisode(primary: FeedItem): Promise<PodcastEpisode | null> {
  if (!isLikelyPodcast(primary)) return null;

  const cached = podcastCache.get(primary.link);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await extractPodcastEpisodeUncached(primary);
  podcastCache.set(primary.link, { value, expiresAt: Date.now() + PODCAST_CACHE_TTL_MS });
  return value;
}

async function extractPodcastEpisodeUncached(primary: FeedItem): Promise<PodcastEpisode | null> {
  const html = await fetchHtml(primary.link);
  if (!html) return null;

  const cneScriptUrl = extractCneAudioScriptUrl(html);
  if (cneScriptUrl) {
    const fromCne = await extractFromCneAudioScript(cneScriptUrl);
    if (fromCne) return fromCne;

    const generic = extractGenericPodcastMetadata(html);
    if (generic) {
      return {
        ...generic,
        embedScriptUrl: cneScriptUrl,
        provider: "cne-audio",
      };
    }
  }

  return extractGenericPodcastMetadata(html);
}

function isLikelyPodcast(primary: FeedItem): boolean {
  const haystack = [
    primary.title,
    primary.description,
    primary.link,
    ...(primary.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\/podcast\//.test(primary.link.toLowerCase()) ||
    /\bpodcast\b/.test(haystack) ||
    /\baudio player\b/.test(haystack) ||
    /\blisten\b/.test(haystack)
  );
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PODCAST_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "PooterWorld/1.0 (+https://pooter.world)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;

    return await res.text();
  } catch (e) {
    reportWarn("podcast:fetch", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCneAudioScriptUrl(html: string): string | null {
  const rawMatch =
    html.match(/https:\/\/embed-audio\.cnevids\.com\/script\/episode\/[a-z0-9-]+/i) ||
    html.match(/https:\\u002F\\u002Fembed-audio\.cnevids\.com\\u002Fscript\\u002Fepisode\\u002F[a-z0-9-]+/i);

  if (!rawMatch?.[0]) return null;
  return rawMatch[0].replace(/\\u002F/g, "/");
}

async function extractFromCneAudioScript(scriptUrl: string): Promise<PodcastEpisode | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PODCAST_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(scriptUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "PooterWorld/1.0 (+https://pooter.world)" },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const script = await res.text();

    const start = script.indexOf("var data = ");
    const end = script.indexOf(";\n      var skin =", start);
    if (start === -1 || end === -1) return null;

    const rawJson = script.slice(start + "var data = ".length, end).trim();
    const parsed = JSON.parse(rawJson) as CneAudioData;
    const episode = parsed.audios?.[0];
    const platformLinks = dedupePlatformLinks(
      (parsed.platforms || [])
        .map((link) => ({
          name: (link.name || "").trim(),
          url: (link.value || "").trim(),
        }))
        .filter((link) => link.name && link.url),
    );

    return {
      title: episode?.title || parsed.title || "Podcast episode",
      showTitle: parsed.title || null,
      summary: episode?.summary || null,
      audioUrl: episode?.files?.[0] || null,
      imageUrl:
        episode?.image?.assets?.["220x220"]?.url ||
        episode?.image?.publicUrl ||
        parsed.image?.assets?.["220x220"]?.url ||
        parsed.image?.publicUrl ||
        null,
      durationSeconds: Number.isFinite(episode?.duration) ? episode?.duration || null : null,
      publishedAt: episode?.pubDate || null,
      provider: episode?.provider?.name || "cne-audio",
      embedScriptUrl: scriptUrl,
      platformLinks,
    };
  } catch (e) {
    reportWarn("podcast:fetch", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractGenericPodcastMetadata(html: string): PodcastEpisode | null {
  const audioUrl = extractAudioUrl(html);
  const title = extractMetaContent(html, "og:title") || extractTitleTag(html);
  const summary =
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description") ||
    null;
  const imageUrl = extractMetaContent(html, "og:image") || null;
  const platformLinks = dedupePlatformLinks([
    ...extractLinks(html, "Apple Podcasts", /https?:\/\/podcasts\.apple\.com\/[^"' <]+/gi),
    ...extractLinks(html, "Spotify", /https?:\/\/open\.spotify\.com\/[^"' <]+/gi),
    ...extractLinks(html, "Overcast", /https?:\/\/overcast\.fm\/[^"' <]+/gi),
    ...extractLinks(html, "Pocket Casts", /https?:\/\/pca\.st\/[^"' <]+/gi),
    ...extractLinks(html, "Pocket Casts", /https?:\/\/pocketcasts\.com\/[^"' <]+/gi),
  ]);

  if (!audioUrl && platformLinks.length === 0) return null;

  return {
    title: title || "Podcast episode",
    summary,
    audioUrl,
    imageUrl,
    platformLinks,
    provider: "generic-podcast",
  };
}

function extractAudioUrl(html: string): string | null {
  const directPatterns = [
    /https?:\/\/[^"' <]+?\.(?:mp3|m4a|aac|ogg|wav)(?:\?[^"' <]*)?/i,
    /<audio\b[^>]*src=["']([^"']+)["']/i,
    /<source\b[^>]*src=["']([^"']+)["'][^>]*type=["']audio\/[^"']+["']/i,
  ];

  for (const pattern of directPatterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] || match?.[0];
    if (candidate) {
      return cleanExtractedUrl(decodeEscapedUrl(candidate));
    }
  }

  const metaKeys = [
    "og:audio",
    "og:audio:secure_url",
    "twitter:player:stream",
    "twitter:player:stream:content_type",
  ];

  for (const key of metaKeys) {
    const candidate = extractMetaContent(html, key);
    if (candidate && /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(candidate)) {
      return cleanExtractedUrl(candidate);
    }
  }

  return null;
}

function extractMetaContent(html: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:name|property)=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = html.match(pattern);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function extractFirstUrl(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[0] || null;
}

function extractLinks(html: string, name: string, pattern: RegExp): PodcastPlatformLink[] {
  const matches = html.match(pattern) || [];
  return matches.map((url) => ({ name, url: cleanExtractedUrl(decodeEscapedUrl(url)) }));
}

function dedupePlatformLinks(links: PodcastPlatformLink[]): PodcastPlatformLink[] {
  const seen = new Set<string>();
  const out: PodcastPlatformLink[] = [];

  for (const link of links) {
    const normalized = link.url.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({ name: link.name, url: normalized });
  }

  return out;
}

function decodeEscapedUrl(url: string): string {
  return decodeHtml(url).replace(/\\u002F/g, "/");
}

function cleanExtractedUrl(url: string): string {
  return url.replace(/[}"']+$/g, "").trim();
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
