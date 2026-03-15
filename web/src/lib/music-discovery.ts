// ============================================================================
// MUSIC DISCOVERY ENGINE — YouTube search + channel RSS + Last.fm
// Primary: scrapes YouTube search results (no API key, wide net)
// Secondary: channel RSS feeds for label/session depth
// ============================================================================

import "server-only";
import type {
  DiscoveryTrack,
  DiscoveryRequest,
  DiscoveryResponse,
  TasteVectors,
} from "./music-types";
import { MUSIC_CHANNELS, tagGenresFromTitle, MUSIC_GENRE_PATTERNS, type MusicChannel } from "./music-channels";
import {
  isLastfmConfigured,
  getSimilarArtists,
  getTopTracksByTag,
} from "./music-lastfm";

// ── Cache ────────────────────────────────────────────────────────────────

let discoveryCache: { tracks: DiscoveryTrack[]; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 4000;
const YT_SEARCH_TIMEOUT_MS = 8000;

// ── Search Terms — broad, taste-informed, no specific artists ───────────

const DISCOVERY_SEARCH_TERMS = [
  // Dream pop / shoegaze / ethereal
  "dream pop live session", "shoegaze full album", "ethereal wave music",
  // Trip-hop / downtempo
  "trip hop mix", "downtempo chill beats", "trip hop album",
  // Underground hip-hop / boom-bap
  "underground boom bap", "abstract hip hop beats",
  "beat tape instrumental", "lo-fi hip hop producer beat tape",
  "rap freestyle cypher", "independent hip hop",
  // Cloud rap / drain / experimental
  "cloud rap", "experimental rap", "drain gang type",
  // Lo-fi / bedroom / indie
  "lo-fi bedroom recording", "indie rock live session", "jangle pop",
  "bedroom pop", "slacker rock",
  // Post-punk / punk / garage
  "post-punk live session", "garage rock live", "punk house show",
  "noise rock", "no wave",
  // Folk / anti-folk
  "anti-folk acoustic session", "indie folk live", "freak folk",
  // Jazz / soul / funk
  "jazz fusion live", "neo soul live performance", "funk groove live",
  "broken beat", "spiritual jazz",
  // Electronic / ambient / experimental
  "ambient electronic", "experimental electronic", "idm music",
  "modular synth", "field recordings music",
  // Surf / psych
  "surf rock", "psychedelic rock live", "krautrock motorik",
  "space rock", "acid rock",
  // Latin / world
  "reggaeton underground", "cumbia digital", "afrobeat live",
  "bossa nova", "tropicalia",
  // Southern rock / blues
  "southern rock live", "blues rock session", "delta blues",
  // Britpop / dance-punk
  "britpop", "dance punk", "indie dance",
  // Bass / dub / grime
  "dubstep deep", "grime freestyle", "dub music roots",
  // Math rock / post-rock
  "math rock live", "post-rock full album", "emo midwest",
  // Misc vibes
  "vinyl digging obscure", "record store music",
  "world music live session", "experimental music new",
];

// ── Main Entry Point ────────────────────────────────────────────────────

export async function fetchMusicDiscovery(
  request: DiscoveryRequest,
): Promise<DiscoveryResponse> {
  const raw = await getRawTracks(request.seedArtists, request.seedGenres);

  const scored = raw.map((track) => ({
    ...track,
    score: computeTrackScore(track, request.vectors, request.seedGenres),
  }));

  // Filter out seed artists
  const noSeeds = scored.filter(
    (t) => !isSeedArtistMatch(t.artist, request.seedArtists),
  );

  // Filter out already-seen
  const excludeSet = new Set(request.excludeIds);
  const unseen = noSeeds.filter((t) => !excludeSet.has(t.id));

  // Rank with exploration shuffle
  const ranked = applyExplorationShuffle(unseen, request.mode, request.vectors.explorationRate);

  const sourceCounts = new Map<string, number>();
  for (const t of ranked) {
    const key = t.channel || t.source;
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }

  return {
    tracks: ranked.slice(0, request.limit),
    sources: Array.from(sourceCounts.entries()).map(([name, count]) => ({ name, count })),
    generatedAt: new Date().toISOString(),
    aiEnhanced: false,
  };
}

// ── Raw Track Fetching ──────────────────────────────────────────────────

async function getRawTracks(
  seedArtists: string[],
  seedGenres: string[],
): Promise<DiscoveryTrack[]> {
  if (discoveryCache && Date.now() - discoveryCache.ts < CACHE_TTL_MS) {
    console.log(`[Discovery] Serving ${discoveryCache.tracks.length} tracks from cache`);
    return discoveryCache.tracks;
  }

  // Pick random search terms for this batch
  const searchTerms = shuffle(DISCOVERY_SEARCH_TERMS).slice(0, 5);

  // Fetch YouTube search + channel RSS + Last.fm in parallel
  const [searchResults, youtubeResults, lastfmResults] = await Promise.all([
    fetchYouTubeSearch(searchTerms),
    fetchAllYouTubeChannels(),
    fetchLastfmDiscovery(seedArtists, seedGenres),
  ]);

  // Search results first (primary), then channels, then Last.fm
  const all = [...searchResults, ...youtubeResults, ...lastfmResults];
  const deduped = deduplicateByVideoId(all);

  console.log(
    `[Discovery] ${searchResults.length} search + ${youtubeResults.length} RSS + ${lastfmResults.length} Last.fm → ${deduped.length} unique`,
  );

  discoveryCache = { tracks: deduped, ts: Date.now() };
  return deduped;
}

// ── YouTube Search (direct scraping — no API key needed) ────────────────

async function fetchYouTubeSearch(queries: string[]): Promise<DiscoveryTrack[]> {
  const results = await Promise.allSettled(
    queries.map((q) => searchYouTube(q)),
  );

  const tracks: DiscoveryTrack[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      tracks.push(...result.value);
    }
  }
  return tracks;
}

async function searchYouTube(query: string): Promise<DiscoveryTrack[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), YT_SEARCH_TIMEOUT_MS);

    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
    );
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();

    // Extract ytInitialData JSON from page
    const marker = "var ytInitialData = ";
    const start = html.indexOf(marker);
    if (start === -1) return [];
    const jsonStart = start + marker.length;

    // Find matching closing brace (fast scan)
    let depth = 0;
    let end = jsonStart;
    for (let i = jsonStart; i < html.length && i < jsonStart + 2_000_000; i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    // Sanitize control characters and parse
    const jsonStr = html.slice(jsonStart, end).replace(/[\x00-\x1f\x7f]/g, " ");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      return [];
    }

    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    const tracks: DiscoveryTrack[] = [];

    for (const section of contents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = (section?.itemSectionRenderer?.contents || []) as any[];
      for (const item of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = item?.videoRenderer as any;
        if (!v?.videoId) continue;

        const rawTitle: string = v.title?.runs?.[0]?.text || "Unknown";
        const channelName: string = v.ownerText?.runs?.[0]?.text || "Unknown";
        const durText: string = v.lengthText?.simpleText || "";
        const { artist, trackTitle } = parseArtistFromTitle(rawTitle, channelName);
        const genres = tagGenresFromTitle(rawTitle, guessGenresFromQuery(query));

        tracks.push({
          id: `yt-search-${v.videoId}`,
          videoId: v.videoId,
          title: trackTitle,
          artist,
          duration: durText || "unknown",
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${v.videoId}`,
          source: "youtube-search" as const,
          channel: channelName,
          channelId: "",
          pubDate: new Date().toISOString(),
          genres,
          energy: 0.5,
          era: "contemporary" as const,
          score: 0,
        });

        if (tracks.length >= 12) break;
      }
      if (tracks.length >= 12) break;
    }

    return tracks;
  } catch (err) {
    console.log(
      `[Discovery] YouTube search failed for "${query}":`,
      (err as Error).message?.slice(0, 100),
    );
    return [];
  }
}

function guessGenresFromQuery(query: string): string[] {
  const genres: string[] = [];
  for (const [genre, pattern] of Object.entries(MUSIC_GENRE_PATTERNS)) {
    if (pattern.test(query)) {
      genres.push(genre);
    }
  }
  const words = query.toLowerCase().split(/\s+/);
  const genreWords = [
    "jazz", "soul", "funk", "punk", "rock", "pop", "folk", "blues",
    "rap", "electronic", "ambient", "dub", "reggae", "drill", "grime",
    "indie", "metal", "techno", "house", "disco",
  ];
  for (const w of words) {
    if (genreWords.includes(w) && !genres.includes(w)) {
      genres.push(w);
    }
  }
  return genres.length > 0 ? genres : ["indie"];
}

// ── YouTube RSS Crawling (supplementary) ────────────────────────────────

async function fetchAllYouTubeChannels(): Promise<DiscoveryTrack[]> {
  // Random subset of channels each time for variety
  const channelSubset = shuffle(MUSIC_CHANNELS).slice(0, 10);

  const results = await Promise.allSettled(
    channelSubset.map((ch) => fetchYouTubeChannel(ch)),
  );

  const tracks: DiscoveryTrack[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      tracks.push(...result.value);
    }
  }
  return tracks;
}

async function fetchYouTubeChannel(ch: MusicChannel): Promise<DiscoveryTrack[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`,
      { next: { revalidate: 600 }, signal: controller.signal },
    );
    clearTimeout(timer);

    if (!res.ok) return [];
    const xml = await res.text();
    return parseYouTubeMusicRSS(xml, ch);
  } catch {
    return [];
  }
}

function parseYouTubeMusicRSS(xml: string, ch: MusicChannel): DiscoveryTrack[] {
  const tracks: DiscoveryTrack[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
    const rawTitle = entry.match(/<title>(.*?)<\/title>/)?.[1];
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1];

    if (!videoId || !rawTitle || !published) continue;

    const title = decodeXmlEntities(rawTitle);
    const { artist, trackTitle } = parseArtistFromTitle(title, ch.name);
    const genres = tagGenresFromTitle(title, ch.genres);

    tracks.push({
      id: `youtube-rss-${videoId}`,
      videoId,
      title: trackTitle,
      artist,
      duration: "unknown",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      source: "youtube-rss",
      channel: ch.name,
      channelId: ch.channelId,
      pubDate: published,
      genres,
      energy: ch.energy,
      era: guessEra(published),
      score: 0,
    });
  }

  return tracks;
}

// ── Last.fm Discovery ───────────────────────────────────────────────────

async function fetchLastfmDiscovery(
  seedArtists: string[],
  seedGenres: string[],
): Promise<DiscoveryTrack[]> {
  if (!isLastfmConfigured()) return [];

  const tracks: DiscoveryTrack[] = [];
  const artistSample = shuffle(seedArtists).slice(0, 3);
  const genreSample = shuffle(seedGenres).slice(0, 3);

  const promises: Promise<void>[] = [];

  for (const artist of artistSample) {
    promises.push(
      getSimilarArtists(artist, 10).then((similar) => {
        for (const a of similar) {
          tracks.push({
            id: `lastfm-${a.name.toLowerCase().replace(/\s+/g, "-")}`,
            videoId: "",
            title: `Discover: ${a.name}`,
            artist: a.name,
            duration: "unknown",
            thumbnail: "",
            url: a.url,
            embedUrl: "",
            source: "lastfm",
            channel: "Last.fm",
            channelId: "",
            pubDate: new Date().toISOString(),
            genres: a.tags.length > 0 ? a.tags : seedGenres.slice(0, 3),
            energy: 0.5,
            era: "contemporary",
            score: a.match || 0.5,
          });
        }
      }),
    );
  }

  for (const genre of genreSample) {
    promises.push(
      getTopTracksByTag(genre, 10).then((tagTracks) => {
        for (const t of tagTracks) {
          tracks.push({
            id: `lastfm-${t.artist.toLowerCase()}-${t.name.toLowerCase()}`.replace(/\s+/g, "-"),
            videoId: "",
            title: t.name,
            artist: t.artist,
            duration: "unknown",
            thumbnail: "",
            url: t.url,
            embedUrl: "",
            source: "lastfm",
            channel: "Last.fm",
            channelId: "",
            pubDate: new Date().toISOString(),
            genres: [genre],
            energy: 0.5,
            era: "contemporary",
            score: 0.5,
          });
        }
      }),
    );
  }

  await Promise.allSettled(promises);
  return tracks;
}

// ── Scoring ─────────────────────────────────────────────────────────────

function computeTrackScore(
  track: DiscoveryTrack,
  vectors: TasteVectors,
  seedGenres: string[],
): number {
  let score = 0;

  // Factor 1: Genre Affinity (45%)
  if (track.genres.length > 0) {
    let genreScore = 0;
    let matchedGenres = 0;
    for (const genre of track.genres) {
      if (vectors.genreWeights[genre] !== undefined) {
        genreScore += vectors.genreWeights[genre];
        matchedGenres++;
      } else if (seedGenres.includes(genre)) {
        genreScore += 0.3;
        matchedGenres++;
      }
    }
    if (matchedGenres > 0) {
      score += ((genreScore / matchedGenres + 1) / 2) * 0.45;
    }
  }

  // Factor 2: Energy Match (15%)
  const energyDiff = Math.abs(track.energy - vectors.energyPreference);
  score += (1 - energyDiff) * 0.15;

  // Factor 3: Source Quality (15%)
  const sourceScores: Record<string, number> = {
    "youtube-search": 0.7,
    "youtube-rss": 0.8,
    lastfm: 0.6,
    curated: 1.0,
    "ai-recommended": 0.8,
  };
  score += (sourceScores[track.source] ?? 0.5) * 0.15;

  // Factor 4: Era Preference (10%)
  const eraWeight = vectors.eraPreference[track.era] ?? 0.5;
  score += eraWeight * 0.10;

  // Factor 5: Novelty Bonus (10%)
  score += 0.10;

  // Factor 6: Recency (5%)
  const ageHours = (Date.now() - Date.parse(track.pubDate)) / (1000 * 60 * 60);
  const recency = ageHours < 24 ? 1.0 : ageHours < 168 ? 0.7 : ageHours < 720 ? 0.4 : 0.2;
  score += recency * 0.05;

  return Math.max(0, Math.min(1, score));
}

// ── Exploration Shuffle ─────────────────────────────────────────────────

function applyExplorationShuffle(
  tracks: DiscoveryTrack[],
  mode: "explore" | "comfort",
  explorationRate: number,
): DiscoveryTrack[] {
  const sorted = [...tracks].sort((a, b) => b.score - a.score);
  const intensity = mode === "comfort" ? 0.1 : Math.max(0.3, explorationRate);
  return partialShuffle(sorted, intensity);
}

function partialShuffle(arr: DiscoveryTrack[], intensity: number): DiscoveryTrack[] {
  const out = [...arr];
  const swapWindow = Math.max(1, Math.floor(out.length * intensity));
  for (let i = 0; i < out.length; i++) {
    if (Math.random() > intensity) continue;
    const j = Math.min(out.length - 1, i + Math.floor(Math.random() * swapWindow));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function deduplicateByVideoId(tracks: DiscoveryTrack[]): DiscoveryTrack[] {
  const seen = new Map<string, DiscoveryTrack>();
  for (const track of tracks) {
    const key = track.videoId
      ? track.videoId
      : `${track.artist.toLowerCase()}-${track.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, track);
    }
  }
  return Array.from(seen.values());
}

function isSeedArtistMatch(artist: string, seedArtists: string[]): boolean {
  const norm = normalizeArtistName(artist);
  return seedArtists.some((seed) => {
    const normSeed = normalizeArtistName(seed);
    return norm === normSeed || norm.includes(normSeed) || normSeed.includes(norm);
  });
}

function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArtistFromTitle(
  title: string,
  channelName: string,
): { artist: string; trackTitle: string } {
  const separators = [" - ", " — ", " – ", " | ", ": "];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0 && idx < title.length - sep.length) {
      return {
        artist: title.slice(0, idx).trim(),
        trackTitle: title.slice(idx + sep.length).trim(),
      };
    }
  }
  return { artist: channelName, trackTitle: title };
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function guessEra(pubDate: string): "classic" | "modern" | "contemporary" {
  const year = new Date(pubDate).getFullYear();
  if (year < 2010) return "classic";
  if (year < 2020) return "modern";
  return "contemporary";
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
