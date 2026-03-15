// ============================================================================
// MUSIC TASTE ENGINE — Client-side taste profile with localStorage persistence
// Follows the stumble-context.ts pattern (readStore/writeStore/prune)
// ============================================================================

import type { TasteProfile, TasteSignal, TasteVectors } from "./music-types";

const TASTE_KEY = "pooter:music-taste:v1";
const MAX_SIGNALS = 500;
const DECAY_DAYS = 14;

// Signal action weights
const SIGNAL_WEIGHTS: Record<TasteSignal["action"], number> = {
  play: 0.3,
  skip: -0.2,
  like: 1.0,
  dislike: -1.0,
};

// ── Seed DNA — never surfaced as recommendations ────────────────────────

const DEFAULT_SEED_ARTISTS = [
  "mazzy star", "portishead", "massive attack",
  "lynyrd skynyrd",
  "neptunes", "n.e.r.d.", "madlib", "j dilla", "alchemist",
  "mf doom", "doom", "earl sweatshirt", "mike", "boldy james",
  "yung lean", "bladee", "yung gud", "bexey",
  "css", "klaxons", "foals", "libertines", "peter doherty", "frank turner",
  "michael jackson", "prince",
  "bad bunny", "g herbo", "sam gellaitry", "mo kolors",
  "black moth super rainbow", "willy mason", "aesop rock",
  "kimya dawson", "moldy peaches",
];

const DEFAULT_SEED_GENRES = [
  "dream-pop", "trip-hop", "shoegaze",
  "southern-rock", "classic-rock",
  "hip-hop", "underground-rap", "boom-bap", "abstract-hip-hop",
  "cloud-rap", "drain-gang", "vapor-rap",
  "indie-rock", "britpop", "post-punk-revival",
  "lo-fi", "surf-rock",
  "pop", "funk", "r-and-b",
  "anti-folk", "freak-folk",
  "electronic", "beat-music",
  "reggaeton", "drill",
  "psychedelic", "noise-pop",
];

// ── localStorage I/O ────────────────────────────────────────────────────

function readStore(): TasteProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TASTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TasteProfile;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(profile: TasteProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TASTE_KEY, JSON.stringify(profile));
  } catch {
    // best-effort
  }
}

function createDefaultProfile(): TasteProfile {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    seedArtists: DEFAULT_SEED_ARTISTS,
    seedGenres: DEFAULT_SEED_GENRES,
    signals: [],
    vectors: defaultVectors(),
  };
}

function defaultVectors(): TasteVectors {
  // Start with seed genres having mild positive weights
  const genreWeights: Record<string, number> = {};
  for (const g of DEFAULT_SEED_GENRES) {
    genreWeights[g] = 0.3;
  }
  return {
    genreWeights,
    energyPreference: 0.5,
    eraPreference: { classic: 0.4, modern: 0.5, contemporary: 0.6 },
    explorationRate: 0.7,
  };
}

// ── Public API ──────────────────────────────────────────────────────────

export function getTasteProfile(): TasteProfile {
  return readStore() || createDefaultProfile();
}

export function recordSignal(
  signal: Omit<TasteSignal, "timestamp">,
): void {
  const profile = getTasteProfile();
  const entry: TasteSignal = {
    ...signal,
    timestamp: new Date().toISOString(),
  };

  profile.signals.push(entry);

  // FIFO eviction
  if (profile.signals.length > MAX_SIGNALS) {
    profile.signals = profile.signals.slice(-MAX_SIGNALS);
  }

  // Recompute vectors
  profile.vectors = recomputeVectors(profile);
  profile.updatedAt = new Date().toISOString();

  writeStore(profile);
}

export function getSignalForTrack(
  trackId: string,
): "like" | "dislike" | null {
  const profile = readStore();
  if (!profile) return null;
  // Find most recent like/dislike for this track
  for (let i = profile.signals.length - 1; i >= 0; i--) {
    const s = profile.signals[i];
    if (s.trackId === trackId && (s.action === "like" || s.action === "dislike")) {
      return s.action;
    }
  }
  return null;
}

export function resetTasteProfile(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TASTE_KEY);
}

export function isSeedArtist(artist: string): boolean {
  const norm = normalizeArtistName(artist);
  return DEFAULT_SEED_ARTISTS.some((seed) => {
    const normSeed = normalizeArtistName(seed);
    return norm === normSeed || norm.includes(normSeed) || normSeed.includes(norm);
  });
}

// ── Vector Recomputation ────────────────────────────────────────────────

function recomputeVectors(profile: TasteProfile): TasteVectors {
  // Start from seed defaults
  const genreScores: Record<string, { sum: number; count: number }> = {};
  for (const g of profile.seedGenres) {
    genreScores[g] = { sum: 0.3, count: 1 };
  }

  let energySum = 0.5;
  let energyCount = 1;
  const now = Date.now();

  for (const signal of profile.signals) {
    const ageMs = now - Date.parse(signal.timestamp);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const decay = ageDays > DECAY_DAYS ? 0.5 : 1.0;
    const weight = SIGNAL_WEIGHTS[signal.action] * decay;

    for (const genre of signal.genres) {
      if (!genreScores[genre]) genreScores[genre] = { sum: 0, count: 0 };
      genreScores[genre].sum += weight;
      genreScores[genre].count += 1;
    }

    // Play and like nudge energy up slightly, skip/dislike don't affect it much
    if (signal.action === "like" || signal.action === "play") {
      energySum += 0.5 * decay;
      energyCount += 1;
    }
  }

  // Normalize genre weights to [-1, 1]
  const genreWeights: Record<string, number> = {};
  for (const [genre, { sum, count }] of Object.entries(genreScores)) {
    genreWeights[genre] = Math.max(-1, Math.min(1, sum / Math.max(count, 1)));
  }

  // Exploration rate: starts high (0.7), narrows as user gives explicit signals
  const explicitSignals = profile.signals.filter(
    (s) => s.action === "like" || s.action === "dislike",
  ).length;
  const explorationRate = Math.max(0.2, 0.7 - explicitSignals * 0.01);

  return {
    genreWeights,
    energyPreference: Math.max(0, Math.min(1, energySum / energyCount)),
    eraPreference: { classic: 0.4, modern: 0.5, contemporary: 0.6 },
    explorationRate,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
