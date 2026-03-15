// ============================================================================
// LAST.FM API — Free similar-artist + tag-based discovery
// Graceful no-op if LASTFM_API_KEY is not configured.
// Follows the podcast.ts pattern (timeout, caching, graceful fallback).
// ============================================================================

import "server-only";
import type { LastfmArtist, LastfmTrack } from "./music-types";

const LASTFM_API_KEY = process.env.LASTFM_API_KEY?.trim() || null;
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
const FETCH_TIMEOUT_MS = 4000;

// Simple in-memory cache (10-min TTL)
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function isLastfmConfigured(): boolean {
  return LASTFM_API_KEY !== null;
}

// ── Similar Artists ─────────────────────────────────────────────────────

export async function getSimilarArtists(
  artist: string,
  limit = 20,
): Promise<LastfmArtist[]> {
  if (!LASTFM_API_KEY) return [];

  const cacheKey = `similar:${artist}:${limit}`;
  const cached = getCache<LastfmArtist[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      method: "artist.getsimilar",
      artist,
      limit: String(limit),
      api_key: LASTFM_API_KEY,
      format: "json",
    });

    const data = await fetchLastfm(params);
    const artists: LastfmArtist[] = (data?.similarartists?.artist || []).map(
      (a: Record<string, unknown>) => ({
        name: String(a.name || ""),
        mbid: a.mbid ? String(a.mbid) : undefined,
        url: String(a.url || ""),
        match: a.match ? Number(a.match) : undefined,
        tags: [],
      }),
    );

    setCache(cacheKey, artists);
    return artists;
  } catch (err) {
    console.error(`[Last.fm] getSimilarArtists("${artist}") failed:`, err);
    return [];
  }
}

// ── Top Tracks by Tag ───────────────────────────────────────────────────

export async function getTopTracksByTag(
  tag: string,
  limit = 20,
): Promise<LastfmTrack[]> {
  if (!LASTFM_API_KEY) return [];

  const cacheKey = `tag-tracks:${tag}:${limit}`;
  const cached = getCache<LastfmTrack[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      method: "tag.gettoptracks",
      tag,
      limit: String(limit),
      api_key: LASTFM_API_KEY,
      format: "json",
    });

    const data = await fetchLastfm(params);
    const tracks: LastfmTrack[] = (data?.tracks?.track || []).map(
      (t: Record<string, unknown>) => ({
        name: String(t.name || ""),
        artist: typeof t.artist === "object" && t.artist
          ? String((t.artist as Record<string, unknown>).name || "")
          : String(t.artist || ""),
        url: String(t.url || ""),
        playcount: t.playcount ? Number(t.playcount) : undefined,
        listeners: t.listeners ? Number(t.listeners) : undefined,
      }),
    );

    setCache(cacheKey, tracks);
    return tracks;
  } catch (err) {
    console.error(`[Last.fm] getTopTracksByTag("${tag}") failed:`, err);
    return [];
  }
}

// ── Top Artists by Tag ──────────────────────────────────────────────────

export async function getTopArtistsByTag(
  tag: string,
  limit = 20,
): Promise<LastfmArtist[]> {
  if (!LASTFM_API_KEY) return [];

  const cacheKey = `tag-artists:${tag}:${limit}`;
  const cached = getCache<LastfmArtist[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      method: "tag.gettopartists",
      tag,
      limit: String(limit),
      api_key: LASTFM_API_KEY,
      format: "json",
    });

    const data = await fetchLastfm(params);
    const artists: LastfmArtist[] = (data?.topartists?.artist || []).map(
      (a: Record<string, unknown>) => ({
        name: String(a.name || ""),
        mbid: a.mbid ? String(a.mbid) : undefined,
        url: String(a.url || ""),
        tags: [],
      }),
    );

    setCache(cacheKey, artists);
    return artists;
  } catch (err) {
    console.error(`[Last.fm] getTopArtistsByTag("${tag}") failed:`, err);
    return [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLastfm(params: URLSearchParams): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`, {
      headers: { "User-Agent": "PooterWorld/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  // Evict old entries if cache grows too large
  if (cache.size > 200) {
    const oldest = Array.from(cache.entries())
      .sort((a, b) => a[1].ts - b[1].ts)
      .slice(0, 50);
    for (const [k] of oldest) cache.delete(k);
  }
  cache.set(key, { data, ts: Date.now() });
}
