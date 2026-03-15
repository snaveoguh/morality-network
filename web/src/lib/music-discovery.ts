// ============================================================================
// MUSIC DISCOVERY ENGINE — Server-side aggregation, scoring, and ranking
// Follows video.ts (YouTube RSS) + stumble.ts (aggregation) + rss.ts (cache)
// ============================================================================

import "server-only";
import type {
  DiscoveryTrack,
  DiscoveryRequest,
  DiscoveryResponse,
  TasteVectors,
} from "./music-types";
import { MUSIC_CHANNELS, tagGenresFromTitle, type MusicChannel } from "./music-channels";
import {
  isLastfmConfigured,
  getSimilarArtists,
  getTopTracksByTag,
} from "./music-lastfm";

// ── In-memory cache (follows rss.ts pattern) ────────────────────────────

let discoveryCache: { tracks: DiscoveryTrack[]; ts: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 4000;

// ── Main Entry Point ────────────────────────────────────────────────────

export async function fetchMusicDiscovery(
  request: DiscoveryRequest,
): Promise<DiscoveryResponse> {
  // 1. Get raw tracks (cached or fresh)
  const raw = await getRawTracks(request.seedArtists, request.seedGenres);

  // 2. Score each track against taste vectors
  const scored = raw.map((track) => ({
    ...track,
    score: computeTrackScore(track, request.vectors, request.seedGenres),
  }));

  // 3. Filter out seed artists
  const noSeeds = scored.filter(
    (t) => !isSeedArtistMatch(t.artist, request.seedArtists),
  );

  // 4. Filter out already-seen
  const excludeSet = new Set(request.excludeIds);
  const unseen = noSeeds.filter((t) => !excludeSet.has(t.id));

  // 5. Rank with exploration shuffle
  const ranked = applyExplorationShuffle(unseen, request.mode, request.vectors.explorationRate);

  // 6. Collect source stats
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
  // Serve from cache if fresh
  if (discoveryCache && Date.now() - discoveryCache.ts < CACHE_TTL_MS) {
    console.log(`[Discovery] Serving ${discoveryCache.tracks.length} tracks from cache`);
    return discoveryCache.tracks;
  }

  // Fetch YouTube RSS + Last.fm in parallel
  const [youtubeResults, lastfmResults] = await Promise.all([
    fetchAllYouTubeChannels(),
    fetchLastfmDiscovery(seedArtists, seedGenres),
  ]);

  // Merge and deduplicate
  const all = [...youtubeResults, ...lastfmResults];
  const deduped = deduplicateByVideoId(all);

  console.log(
    `[Discovery] Fetched ${youtubeResults.length} YouTube + ${lastfmResults.length} Last.fm → ${deduped.length} unique tracks`,
  );

  discoveryCache = { tracks: deduped, ts: Date.now() };
  return deduped;
}

// ── YouTube RSS Crawling ────────────────────────────────────────────────

async function fetchAllYouTubeChannels(): Promise<DiscoveryTrack[]> {
  const results = await Promise.allSettled(
    MUSIC_CHANNELS.map((ch) => fetchYouTubeChannel(ch)),
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

  // Pick a random subset of seed artists + genres to query (avoid rate limits)
  const artistSample = shuffle(seedArtists).slice(0, 3);
  const genreSample = shuffle(seedGenres).slice(0, 3);

  const promises: Promise<void>[] = [];

  // Similar artists for sampled seeds
  for (const artist of artistSample) {
    promises.push(
      getSimilarArtists(artist, 10).then((similar) => {
        for (const a of similar) {
          // Create a placeholder track — will be matched against YouTube later
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

  // Top tracks by genre tag
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
    curated: 1.0,
    "youtube-rss": 0.7,
    lastfm: 0.6,
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
  const intensity = mode === "comfort" ? 0.1 : Math.max(0.2, explorationRate);
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
    // For Last.fm tracks without videoId, dedupe by artist+title
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
  // Common patterns: "Artist - Song", "Artist | Song", "Artist: Song"
  // KEXP pattern: "Artist - Full Performance (Live on KEXP)"
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
  // Fallback: use channel name as context, full title as trackTitle
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
