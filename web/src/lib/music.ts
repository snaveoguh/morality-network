// ============================================================================
// UNDERGROUND PLAYLIST — curated YouTube sessions & deep cuts
//
// YouTube embed: https://www.youtube.com/embed/{videoId}
// No "server-only" — safe to import in client components.
// ============================================================================

export interface YouTubeTrack {
  videoId: string;
  title: string;
  artist: string;
  duration: string; // human readable e.g. "39:25"
  category: Category;
  genres?: string[];   // for taste matching
  energy?: number;     // 0.0–1.0
}

export type Category =
  | "all"
  | "live"
  | "psych"
  | "electronic"
  | "hip-hop"
  | "jazz"
  | "ambient";

export const CATEGORY_LABELS: Record<Category, string> = {
  all: "All",
  live: "Live Sessions",
  psych: "Psych & Rock",
  electronic: "Electronic",
  "hip-hop": "Hip-Hop",
  jazz: "Jazz & Soul",
  ambient: "Ambient & Downtempo",
};

export const UNDERGROUND_PLAYLIST: YouTubeTrack[] = [
  // ── Live Sessions ────────────────────────────────────────────────────
  {
    videoId: "6MAzUT1YhWE",
    title: "Rooftop Live (Arun's Roof, London)",
    artist: "Fred again..",
    duration: "1:42:08",
    category: "live",
    genres: ["electronic", "house", "dj-set"],
    energy: 0.8,
  },
  {
    videoId: "1h5Ky5cBwA8",
    title: "Full Performance (Live on KEXP)",
    artist: "MONO",
    duration: "30:12",
    category: "live",
    genres: ["post-rock", "shoegaze", "ambient"],
    energy: 0.6,
  },
  {
    videoId: "EnmFKS2eDBA",
    title: "Full Performance (Live on KEXP)",
    artist: "King Gizzard & The Lizard Wizard",
    duration: "28:45",
    category: "live",
    genres: ["psychedelic", "garage", "indie-rock"],
    energy: 0.8,
  },
  {
    videoId: "jmmIS3UQa1E",
    title: "Full Performance (Live on KEXP)",
    artist: "Divide and Dissolve",
    duration: "25:18",
    category: "live",
    genres: ["doom", "experimental", "ambient"],
    energy: 0.7,
  },
  {
    videoId: "GCkIPwv5MdM",
    title: "Full Performance (Live on KEXP)",
    artist: "Dehd",
    duration: "22:34",
    category: "live",
    genres: ["indie-rock", "post-punk", "lo-fi"],
    energy: 0.6,
  },
  {
    videoId: "exXpwHTO1R0",
    title: "Full Performance (Live on KEXP)",
    artist: "Lysistrata",
    duration: "23:41",
    category: "live",
    genres: ["post-punk", "noise-rock", "indie-rock"],
    energy: 0.8,
  },
  {
    videoId: "9ndc3GW6SIM",
    title: "Full Performance (Live on KEXP)",
    artist: "THE THE",
    duration: "31:02",
    category: "live",
    genres: ["post-punk", "new-wave", "indie-rock"],
    energy: 0.5,
  },
  {
    videoId: "xkv5_PFd6Wg",
    title: "Full Performance (Live on KEXP)",
    artist: "Packaging",
    duration: "20:15",
    category: "live",
    genres: ["indie-rock", "post-punk", "lo-fi"],
    energy: 0.6,
  },

  // ── Psych & Rock ─────────────────────────────────────────────────────
  {
    videoId: "LgdEd9uuZpg",
    title: "Full Performance (Live on KEXP)",
    artist: "Rəhman Məmmədli",
    duration: "24:30",
    category: "psych",
    genres: ["psychedelic", "world", "folk"],
    energy: 0.5,
  },
  {
    videoId: "_Mik8XJgpTU",
    title: "Full Performance (Live on KEXP)",
    artist: "Mitsune",
    duration: "21:08",
    category: "psych",
    genres: ["psychedelic", "dream-pop", "shoegaze"],
    energy: 0.5,
  },

  // ── Jazz & Soul ──────────────────────────────────────────────────────
  {
    videoId: "FEdRfxVYLT8",
    title: "Turquoise Galaxy (Live on KEXP)",
    artist: "Yussef Dayes",
    duration: "8:22",
    category: "jazz",
    genres: ["jazz", "neo-soul", "funk", "beat-music"],
    energy: 0.6,
  },
];

/** Deterministic daily pick based on day-of-year. */
export function getDailyTrack(): YouTubeTrack {
  const now = new Date();
  const start = new Date(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return UNDERGROUND_PLAYLIST[dayOfYear % UNDERGROUND_PLAYLIST.length];
}
