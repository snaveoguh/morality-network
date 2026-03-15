// ============================================================================
// MUSIC CHANNELS — YouTube channel registry (supplementary source)
// Primary discovery now comes from YouTube search; channels add depth
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
    energy: 0.5, weight: 0.9,
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
    channelId: "UCg2eLTpmlyQd5Jgg8NXSXUQ", name: "La Blogotheque",
    genres: ["indie-folk", "anti-folk", "singer-songwriter", "indie-rock"],
    energy: 0.4, weight: 0.9,
  },
  {
    channelId: "UCmopeXHb16dHZHI6qRWWkXg", name: "hate5six",
    genres: ["hardcore", "punk", "post-hardcore", "noise", "metal"],
    energy: 0.9, weight: 0.9,
  },
  {
    channelId: "UCPKT_csvP72boVX0XrMtagQ", name: "Cercle",
    genres: ["electronic", "house", "techno", "ambient", "melodic-techno"],
    energy: 0.6, weight: 0.9,
  },

  // ── Labels — Underground Hip-Hop ───────────────────────────────────
  {
    channelId: "UCIcZaLBXZqONLCF-KP14wMQ", name: "Stones Throw",
    genres: ["hip-hop", "boom-bap", "beat-music", "lo-fi-hip-hop", "abstract-hip-hop"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UCHVbuwA78fcrsESJtKGz7dg", name: "Rhymesayers",
    genres: ["hip-hop", "underground-rap", "boom-bap", "abstract-hip-hop"],
    energy: 0.6, weight: 0.9,
  },
  {
    channelId: "UCX9_zt1SmHRqYs8aYUsME0Q", name: "Griselda",
    genres: ["hip-hop", "boom-bap", "underground-rap", "street-rap"],
    energy: 0.6, weight: 0.8,
  },
  {
    channelId: "UC8-eGFkqfIPGuiZJkckcmWA", name: "Daupe Media",
    genres: ["hip-hop", "boom-bap", "underground-rap"],
    energy: 0.6, weight: 0.8,
  },

  // ── Labels — Electronic / Trip-Hop / Bass ──────────────────────────
  {
    channelId: "UCEXRv_qihRwjsV91ftx23-A", name: "Ninja Tune",
    genres: ["electronic", "trip-hop", "downtempo", "beats", "ambient"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UC4hfA78X-lqiRERBZLTnLBw", name: "Warp Records",
    genres: ["electronic", "idm", "experimental", "ambient", "glitch"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UCNvfjGiZOuh78KYMojvugeQ", name: "Hyperdub",
    genres: ["dubstep", "bass", "grime", "electronic", "experimental"],
    energy: 0.6, weight: 0.9,
  },
  {
    channelId: "UCbsFurRq_C5wlCFnVRYuYNQ", name: "Ghostly International",
    genres: ["electronic", "ambient", "synth", "indie-electronic"],
    energy: 0.4, weight: 0.8,
  },

  // ── Labels — Dream Pop / Indie / Shoegaze ──────────────────────────
  {
    channelId: "UC-T3JrzHtDeHAmspt1Zn40A", name: "4AD",
    genres: ["dream-pop", "shoegaze", "indie-rock", "post-punk", "ethereal"],
    energy: 0.4, weight: 1.0,
  },
  {
    channelId: "UCsgEkEWaXKQwrhlLHFbcQFw", name: "Sub Pop",
    genres: ["indie-rock", "grunge", "lo-fi", "garage", "post-punk"],
    energy: 0.6, weight: 0.9,
  },
  {
    channelId: "UCHMhI80M9RqcGSCy2kDpjUg", name: "Mexican Summer",
    genres: ["psych", "dream-pop", "lo-fi", "experimental", "indie"],
    energy: 0.4, weight: 0.8,
  },
  {
    channelId: "UC6Rl1uJ-KEC8VJ94l1QYvBg", name: "Matador",
    genres: ["indie-rock", "post-punk", "noise-pop", "experimental"],
    energy: 0.5, weight: 0.9,
  },
  {
    channelId: "UCe67UQodvQ57t2FWUHiI7Dw", name: "Jagjaguwar",
    genres: ["indie-rock", "folk", "experimental", "dream-pop"],
    energy: 0.4, weight: 0.8,
  },

  // ── Labels — Beats / Future / Jazz ─────────────────────────────────
  {
    channelId: "UCkA1oWaPYqdakWDDIvQDzZA", name: "Brainfeeder",
    genres: ["beat-music", "jazz", "electronic", "experimental", "hip-hop"],
    energy: 0.5, weight: 1.0,
  },
  {
    channelId: "UCQmEioliO9mSfg3VpcMjPoQ", name: "Soulection",
    genres: ["future-beats", "r-and-b", "hip-hop", "electronic"],
    energy: 0.5, weight: 0.9,
  },
  {
    channelId: "UC-dbAMT_ZkZlByJge49qlfA", name: "Brownswood",
    genres: ["jazz", "soul", "world", "beats", "broken-beat"],
    energy: 0.4, weight: 0.9,
  },
  {
    channelId: "UCRgpJtOZHJwxfDxsde1f-ag", name: "Numero Group",
    genres: ["reissue", "funk", "soul", "psych", "obscure"],
    energy: 0.4, weight: 0.9,
  },

  // ── Cloud Rap / Drain / Hyperpop ──────────────────────────────────
  {
    channelId: "UCmPC09McQVZBpbPDa-vRiZg", name: "YEAR0001",
    genres: ["cloud-rap", "drain-gang", "hyperpop", "experimental-rap"],
    energy: 0.5, weight: 0.9,
  },

  // ── Radio / DJ ────────────────────────────────────────────────────
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

  // ── Misc Labels ───────────────────────────────────────────────────
  {
    channelId: "UC24F0SkDGYkmJ1RJvodicXQ", name: "DFA Records",
    genres: ["dance-punk", "electronic", "post-punk", "disco"],
    energy: 0.7, weight: 0.8,
  },
  {
    channelId: "UCr7iv49zibCciRCzlFauotQ", name: "Rough Trade",
    genres: ["indie-rock", "post-punk", "alternative"],
    energy: 0.5, weight: 0.8,
  },
  {
    channelId: "UC7ySGm6ZrkBJkUlXnOZOakQ", name: "On The Corner",
    genres: ["jazz", "world", "experimental", "afrobeat"],
    energy: 0.5, weight: 0.8,
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
