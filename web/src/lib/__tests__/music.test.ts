import { describe, expect, it } from "vitest";
import { UNDERGROUND_PLAYLIST, getDailyTrack, rotationDay } from "../music";

const MAX_SOURCE_SHARE = 0.15;
const DAY_MS = 86_400_000;

describe("UNDERGROUND_PLAYLIST", () => {
  it("has at least 120 tracks", () => {
    expect(UNDERGROUND_PLAYLIST.length).toBeGreaterThanOrEqual(120);
  });

  it("has no duplicate video IDs", () => {
    const ids = UNDERGROUND_PLAYLIST.map((t) => t.videoId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry an 11-character ID, artist, title and source", () => {
    for (const t of UNDERGROUND_PLAYLIST) {
      expect(t.videoId, t.artist).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(t.artist.trim(), t.videoId).not.toBe("");
      expect(t.title.trim(), t.videoId).not.toBe("");
      expect(t.source.trim(), t.videoId).not.toBe("");
    }
  });

  it("keeps every source at or under 15% of the list", () => {
    const counts = new Map<string, number>();
    for (const t of UNDERGROUND_PLAYLIST) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
    for (const [source, n] of counts) {
      expect(n / UNDERGROUND_PLAYLIST.length, source).toBeLessThanOrEqual(MAX_SOURCE_SHARE);
    }
  });
});

describe("getDailyTrack", () => {
  const start = Date.UTC(2026, 0, 1);
  const days = Array.from({ length: 365 * 6 }, (_, d) => new Date(start + d * DAY_MS));

  it("never repeats a source or an artist on consecutive days", () => {
    for (let d = 1; d < days.length; d++) {
      const prev = getDailyTrack(days[d - 1]);
      const cur = getDailyTrack(days[d]);
      expect(cur.source, days[d].toISOString()).not.toBe(prev.source);
      expect(cur.artist, days[d].toISOString()).not.toBe(prev.artist);
    }
  });

  it("is the same all day and stable across calls", () => {
    const morning = new Date("2026-10-30T00:00:01Z");
    const night = new Date("2026-10-30T23:59:59Z");
    expect(getDailyTrack(morning)).toBe(getDailyTrack(night));
    expect(rotationDay(morning)).toBe(rotationDay(night));
  });

  it("plays every track within the first year", () => {
    const seen = new Set(days.slice(0, 365).map((d) => getDailyTrack(d).videoId));
    expect(seen.size).toBe(UNDERGROUND_PLAYLIST.length);
  });
});
