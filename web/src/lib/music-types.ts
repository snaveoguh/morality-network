// ============================================================================
// MUSIC DISCOVERY — Shared types for the taste engine + discovery pipeline
// ============================================================================

// ── Core Discovery Track ────────────────────────────────────────────────

export interface DiscoveryTrack {
  id: string;                    // unique: `${source}-${videoId}`
  videoId: string;               // YouTube video ID
  title: string;
  artist: string;
  duration: string;              // human-readable "4:32" or "unknown"
  thumbnail: string;             // https://i.ytimg.com/vi/{id}/mqdefault.jpg
  url: string;                   // YouTube watch URL
  embedUrl: string;              // YouTube embed URL (nocookie)
  source: DiscoverySource;
  channel: string;               // YouTube channel name
  channelId: string;
  pubDate: string;               // ISO date
  genres: string[];              // ["dream-pop", "shoegaze", "lo-fi"]
  energy: number;                // 0.0–1.0
  era: "classic" | "modern" | "contemporary";
  score: number;                 // discovery ranking score 0.0–1.0
}

export type DiscoverySource =
  | "youtube-rss"
  | "lastfm"
  | "curated"
  | "ai-recommended";

// ── Taste Profile (localStorage) ────────────────────────────────────────

export interface TasteProfile {
  version: 1;
  createdAt: string;
  updatedAt: string;
  seedArtists: string[];         // normalized lowercase, never surfaced
  seedGenres: string[];
  signals: TasteSignal[];        // max 500, FIFO
  vectors: TasteVectors;
}

export interface TasteSignal {
  trackId: string;
  artist: string;
  genres: string[];
  action: "play" | "skip" | "like" | "dislike";
  timestamp: string;             // ISO date
}

export interface TasteVectors {
  genreWeights: Record<string, number>;   // genre → -1.0 to 1.0
  energyPreference: number;               // 0.0–1.0
  eraPreference: Record<string, number>;  // era → weight
  explorationRate: number;                // 0.0–1.0
}

// ── Last.fm Types ───────────────────────────────────────────────────────

export interface LastfmArtist {
  name: string;
  mbid?: string;
  url: string;
  match?: number;                // 0.0–1.0 similarity
  tags: string[];
}

export interface LastfmTrack {
  name: string;
  artist: string;
  url: string;
  playcount?: number;
  listeners?: number;
}

// ── Discovery API ───────────────────────────────────────────────────────

export interface DiscoveryRequest {
  vectors: TasteVectors;
  seedGenres: string[];
  seedArtists: string[];
  excludeIds: string[];          // already seen/played
  limit: number;                 // default 20
  mode: "explore" | "comfort";
}

export interface DiscoveryResponse {
  tracks: DiscoveryTrack[];
  sources: { name: string; count: number }[];
  generatedAt: string;
  aiEnhanced: boolean;
}
