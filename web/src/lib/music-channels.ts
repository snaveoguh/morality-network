// ============================================================================
// MUSIC CHANNELS — YouTube channel registry for discovery crawling
// Uses free YouTube RSS feeds: youtube.com/feeds/videos.xml?channel_id=XXX
// Follows the VIDEO_CHANNELS pattern from video.ts
// ============================================================================

export interface MusicChannel {
  channelId: string;
  name: string;
  genres: string[];
  energy: number;    // default energy 0.0–1.0
  weight: number;    // trust level 0.0–1.0
}

export const MUSIC_CHANNELS: MusicChannel[] = [
  // ── Live Sessions / Performance ───────────────────────────────────
  {
    channelId: "UC3I2GFN_F8WudD_2jUZbojA", name: "KEXP",
    genres: ["indie-rock", "dream-pop", "shoegaze", "psych", "lo-fi", "post-punk"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UC4eYXhJI4-7wSWc8UNRwD4A", name: "NPR Tiny Desk",
    genres: ["indie", "folk", "hip-hop", "jazz", "r-and-b", "latin"],
    energy: 0.4, weight: 1.0,
  },
  {
    channelId: "UC2XeMbi-6HZtGO-OvU0bZ2w", name: "COLORS",
    genres: ["r-and-b", "hip-hop", "neo-soul", "pop", "indie"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UCDxKMlnCAOax0OJ3UNh7C6g", name: "Audiotree Live",
    genres: ["indie-rock", "math-rock", "emo", "post-rock", "lo-fi"],
    energy: 0.5, weight: 0.9,
  },
  {
    channelId: "UCkfVkC6V5Bt6cl2MhWIbJYA", name: "Sofar Sounds",
    genres: ["singer-songwriter", "indie-folk", "acoustic", "lo-fi"],
    energy: 0.3, weight: 0.8,
  },
  {
    channelId: "UCN0HnzbZzSMJrtLZyWFT1Cg", name: "Mahogany Sessions",
    genres: ["indie-folk", "dream-pop", "singer-songwriter", "acoustic"],
    energy: 0.3, weight: 0.8,
  },
  {
    channelId: "UCg2eLTpmlyQd5Jgg8NXSXUQ", name: "La Blogotheque",
    genres: ["indie-folk", "anti-folk", "singer-songwriter", "indie-rock"],
    energy: 0.4, weight: 0.9,
  },

  // ── Underground Hip-Hop / Rap ─────────────────────────────────────
  {
    channelId: "UCIcZaLBXZqONLCF-KP14wMQ", name: "Stones Throw",
    genres: ["hip-hop", "boom-bap", "beat-music", "lo-fi-hip-hop", "abstract-hip-hop"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UCQdSuoNJmm4WJwBN8vGijIg", name: "Mass Appeal",
    genres: ["hip-hop", "underground-rap", "east-coast"],
    energy: 0.6, weight: 0.8,
  },
  {
    channelId: "UCX9_zt1SmHRqYs8aYUsME0Q", name: "Griselda",
    genres: ["hip-hop", "boom-bap", "underground-rap", "street-rap"],
    energy: 0.6, weight: 0.8,
  },

  // ── Electronic / Trip-Hop / Ambient ───────────────────────────────
  {
    channelId: "UCGBpxWJr9FNOcFYA5GkKrMg", name: "Boiler Room",
    genres: ["electronic", "techno", "house", "ambient", "dj-set"],
    energy: 0.7, weight: 0.9,
  },
  {
    channelId: "UCkKMqKN3eOYEFKOgHAOjGrQ", name: "NTS Radio",
    genres: ["experimental", "electronic", "ambient", "world", "dub"],
    energy: 0.5, weight: 0.9,
  },
  {
    channelId: "UCWzZ5TIGoZ6o-KtbGCyhnhg", name: "The Lot Radio",
    genres: ["electronic", "ambient", "dj-set", "experimental"],
    energy: 0.5, weight: 0.8,
  },
  {
    channelId: "UCOxqgCwgOqC2lMqC5PYz_Dg", name: "Majestic Casual",
    genres: ["electronic", "chillwave", "trip-hop", "lo-fi-house"],
    energy: 0.4, weight: 0.7,
  },

  // ── Cloud Rap / Drain / Hyperpop ──────────────────────────────────
  {
    channelId: "UCmPC09McQVZBpbPDa-vRiZg", name: "YEAR0001",
    genres: ["cloud-rap", "drain-gang", "hyperpop", "experimental-rap"],
    energy: 0.5, weight: 0.9,
  },
  {
    channelId: "UC9Oe3tiNr7q8F39VDa9oWSQ", name: "Lyrical Lemonade",
    genres: ["hip-hop", "cloud-rap", "trap", "drill"],
    energy: 0.7, weight: 0.7,
  },

  // ── Indie / Dream Pop / Shoegaze ──────────────────────────────────
  {
    channelId: "UCXQ4BUGS07TQDOg_DmEG93w", name: "Pitchfork",
    genres: ["indie-rock", "dream-pop", "shoegaze", "experimental", "hip-hop"],
    energy: 0.5, weight: 0.7,
  },

  // ── Production / Beat-Making ──────────────────────────────────────
  {
    channelId: "UCJ0-OtVpF0wOKEqT2Z1HEtA", name: "Fact Magazine",
    genres: ["electronic", "beat-music", "production", "experimental"],
    energy: 0.6, weight: 0.8,
  },

  // ── Jazz / Soul / Funk ────────────────────────────────────────────
  {
    channelId: "UCCzhl768IcEn7VCx4ECJAyA", name: "Jazz Cafe",
    genres: ["jazz", "neo-soul", "funk", "r-and-b"],
    energy: 0.4, weight: 0.7,
  },

  // ── Misc / Eclectic ───────────────────────────────────────────────
  {
    channelId: "UCKmfHa0SgkbHO3UB41O2Mug", name: "Genius",
    genres: ["hip-hop", "pop", "r-and-b", "production"],
    energy: 0.6, weight: 0.5,
  },
  {
    channelId: "UCdI8evszfZvyAi2YJFrx8cA", name: "Song Exploder",
    genres: ["indie", "production", "songwriting"],
    energy: 0.3, weight: 0.6,
  },
];

// ── Genre Tagging from Title Keywords ───────────────────────────────────

export const MUSIC_GENRE_PATTERNS: Record<string, RegExp> = {
  "hip-hop":      /\b(hip.?hop|rap|freestyle|cypher|bars|mc\b)/i,
  "jazz":         /\b(jazz|swing|bebop|modal|trio\b)/i,
  "electronic":   /\b(electronic|techno|house|synth|edm|idm\b)/i,
  "ambient":      /\b(ambient|drone|soundscape)/i,
  "lo-fi":        /\b(lo.?fi|lofi|bedroom|cassette)/i,
  "dream-pop":    /\b(dream.?pop|shoegaze|ethereal|hazy)/i,
  "punk":         /\b(punk|hardcore|crust|post.?punk|garage)/i,
  "folk":         /\b(folk|acoustic|singer.?songwriter|anti.?folk)/i,
  "soul":         /\b(soul|motown|r.?n.?b|neo.?soul|funk)/i,
  "psychedelic":  /\b(psych|psychedelic|acid|krautrock|space.?rock)/i,
  "latin":        /\b(reggaeton|latin|cumbia|salsa|bachata|dembow)/i,
  "dj-set":       /\b(dj.?set|mix\b|boiler.?room|live.?set)/i,
  "boom-bap":     /\b(boom.?bap|90s|golden.?age|sample)/i,
  "cloud-rap":    /\b(cloud|drain|sad.?boy|vaporwave)/i,
  "indie-rock":   /\b(indie|alternative|guitar|jangle)/i,
};

export function tagGenresFromTitle(
  title: string,
  channelGenres: string[],
): string[] {
  const genres = new Set(channelGenres);
  for (const [genre, pattern] of Object.entries(MUSIC_GENRE_PATTERNS)) {
    if (pattern.test(title)) {
      genres.add(genre);
    }
  }
  return Array.from(genres);
}
