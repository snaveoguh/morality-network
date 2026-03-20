"use client";

import { useState, useCallback } from "react";
import type { DiscoveryTrack, DiscoveryResponse } from "@/lib/music-types";
import {
  getTasteProfile,
  recordSignal,
  getSignalForTrack,
} from "@/lib/music-taste";

// ============================================================================
// DiscoveryFeed — Taste-aware music discovery with like/dislike
// ============================================================================

interface DiscoveryFeedProps {
  onPlayTrack: (track: DiscoveryTrack) => void;
  activeVideoId?: string;
}

export function DiscoveryFeed({ onPlayTrack, activeVideoId }: DiscoveryFeedProps) {
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);

  const handleDigDeeper = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const profile = getTasteProfile();
      let res = await fetch("/api/music/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vectors: profile.vectors,
          seedGenres: profile.seedGenres,
          seedArtists: profile.seedArtists,
          excludeIds: seenIds,
          limit: 20,
          mode: "explore",
        }),
      });
      if (res.status === 401) {
        res = await fetch("/api/music/discover", { cache: "no-store" });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as DiscoveryResponse;

      // Filter to tracks that have a YouTube videoId (playable)
      const playable = data.tracks.filter((t) => t.videoId);
      setTracks(playable);
      setSeenIds((prev) => [...prev, ...playable.map((t) => t.id)]);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }, [seenIds]);

  const handleLike = useCallback(
    (track: DiscoveryTrack) => {
      recordSignal({
        trackId: track.id,
        artist: track.artist,
        genres: track.genres,
        action: "like",
      });
      // Force re-render to update button state
      setTracks((prev) => [...prev]);
    },
    [],
  );

  const handleDislike = useCallback(
    (track: DiscoveryTrack) => {
      recordSignal({
        trackId: track.id,
        artist: track.artist,
        genres: track.genres,
        action: "dislike",
      });
      // Remove disliked track from view
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
    },
    [],
  );

  return (
    <section className="mt-8">
      <div className="mb-4 border-b border-[var(--rule)] pb-3">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Discovery
        </h2>
        <p className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">
          Taste-aware digging. Gets smarter the more you use it.
        </p>
      </div>

      {/* Dig Deeper button */}
      <button
        type="button"
        onClick={handleDigDeeper}
        disabled={loading}
        className="mb-4 w-full border border-[var(--rule)] py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-40"
      >
        {loading ? "Digging..." : hasSearched ? "Dig Again" : "Dig Deeper"}
      </button>

      {error && (
        <p className="mb-4 font-mono text-[9px] text-[var(--accent-red)]">
          {error}
        </p>
      )}

      {/* Results */}
      {tracks.length > 0 && (
        <div className="divide-y divide-[var(--rule-light)] border border-[var(--rule-light)]">
          {tracks.map((track, i) => {
            const isActive = track.videoId === activeVideoId;
            const signal = getSignalForTrack(track.id);

            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                  isActive ? "bg-[var(--rule-light)]" : ""
                }`}
              >
                {/* Track number / play indicator */}
                <span className="w-5 shrink-0 font-mono text-[9px] text-[var(--ink-faint)]">
                  {isActive ? (
                    <span className="text-[var(--accent-red)]">&#9654;</span>
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>

                {/* Thumbnail */}
                {track.thumbnail && (
                  <button
                    type="button"
                    onClick={() => onPlayTrack(track)}
                    className="shrink-0 overflow-hidden border border-[var(--rule-light)]"
                    aria-label={`Play ${track.artist} — ${track.title}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={track.thumbnail}
                      alt=""
                      width={64}
                      height={36}
                      className="h-9 w-16 object-cover"
                      loading="lazy"
                    />
                  </button>
                )}

                {/* Track info */}
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`block truncate font-headline-serif text-sm ${
                      isActive
                        ? "font-bold text-[var(--ink)]"
                        : "text-[var(--ink-light)]"
                    }`}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-[var(--ink-faint)]">
                    {track.artist}
                    {track.channel && track.channel !== "Last.fm" && (
                      <span className="ml-1.5 opacity-60">via {track.channel}</span>
                    )}
                  </span>
                </button>

                {/* Genre pills */}
                <div className="hidden shrink-0 gap-1 sm:flex">
                  {track.genres.slice(0, 2).map((g) => (
                    <span
                      key={g}
                      className="border border-[var(--rule-light)] px-1 py-0.5 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]"
                    >
                      {g}
                    </span>
                  ))}
                </div>

                {/* Like / Dislike */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleLike(track)}
                    className={`px-1.5 py-1 font-mono text-[10px] transition-colors ${
                      signal === "like"
                        ? "font-bold text-[var(--ink)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                    aria-label="Like"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDislike(track)}
                    className={`px-1.5 py-1 font-mono text-[10px] transition-colors ${
                      signal === "dislike"
                        ? "font-bold text-[var(--accent-red)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--accent-red)]"
                    }`}
                    aria-label="Dislike"
                  >
                    &minus;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasSearched && tracks.length === 0 && !loading && !error && (
        <p className="py-6 text-center font-mono text-[9px] text-[var(--ink-faint)]">
          No new tracks found. Try digging again.
        </p>
      )}
    </section>
  );
}
