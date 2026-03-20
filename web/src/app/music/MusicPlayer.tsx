"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { DiscoveryTrack, DiscoveryResponse } from "@/lib/music-types";
import {
  getTasteProfile,
  recordSignal,
  getSignalForTrack,
} from "@/lib/music-taste";

// ============================================================================
// MusicPlayer — Discovery-first. Auto-loads. No static playlist.
// YouTube search + channel RSS + taste engine. Shuffle for more.
// ============================================================================

export function MusicPlayer() {
  const [tracks, setTracks] = useState<DiscoveryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<DiscoveryTrack | null>(null);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [likeState, setLikeState] = useState<"like" | "dislike" | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Auto-fetch on mount
  useEffect(() => {
    dig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track like state per active track
  useEffect(() => {
    if (activeTrack) {
      setLikeState(getSignalForTrack(activeTrack.id));
    }
  }, [activeTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dig = useCallback(async () => {
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
      const playable = data.tracks.filter((t) => t.videoId);
      setTracks(playable);

      if (playable.length > 0) {
        setActiveTrack(playable[0]);
        recordSignal({
          trackId: playable[0].id,
          artist: playable[0].artist,
          genres: playable[0].genres,
          action: "play",
        });
      }

      setSeenIds((prev) => [...prev, ...playable.map((t) => t.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }, [seenIds]);

  const handlePlay = useCallback((track: DiscoveryTrack) => {
    setActiveTrack(track);
    recordSignal({
      trackId: track.id,
      artist: track.artist,
      genres: track.genres,
      action: "play",
    });
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const playNext = useCallback(() => {
    if (!activeTrack || tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === activeTrack.id);
    const next = tracks[(idx + 1) % tracks.length];
    handlePlay(next);
  }, [tracks, activeTrack, handlePlay]);

  const playPrev = useCallback(() => {
    if (!activeTrack || tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === activeTrack.id);
    const prev = tracks[(idx - 1 + tracks.length) % tracks.length];
    handlePlay(prev);
  }, [tracks, activeTrack, handlePlay]);

  const handleLike = useCallback(() => {
    if (!activeTrack) return;
    recordSignal({
      trackId: activeTrack.id,
      artist: activeTrack.artist,
      genres: activeTrack.genres,
      action: "like",
    });
    setLikeState("like");
  }, [activeTrack]);

  const handleDislike = useCallback(() => {
    if (!activeTrack) return;
    recordSignal({
      trackId: activeTrack.id,
      artist: activeTrack.artist,
      genres: activeTrack.genres,
      action: "dislike",
    });
    setLikeState("dislike");
    // Skip to next
    playNext();
  }, [activeTrack, playNext]);

  const handleTrackLike = useCallback((track: DiscoveryTrack) => {
    recordSignal({
      trackId: track.id,
      artist: track.artist,
      genres: track.genres,
      action: "like",
    });
    setTracks((prev) => [...prev]); // re-render for button state
  }, []);

  const handleTrackDislike = useCallback((track: DiscoveryTrack) => {
    recordSignal({
      trackId: track.id,
      artist: track.artist,
      genres: track.genres,
      action: "dislike",
    });
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
  }, []);

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading && tracks.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse bg-[var(--rule-light)]" />
        <div className="aspect-video w-full animate-pulse bg-[var(--rule-light)]" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-[var(--rule-light)]" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && tracks.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 font-mono text-[10px] text-[var(--accent-red)]">
          {error}
        </p>
        <button
          type="button"
          onClick={dig}
          className="border border-[var(--rule)] px-6 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Player ──────────────────────────────────────────────────── */}
      {activeTrack && (
        <section ref={playerRef} className="mb-6">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
            Now Playing
          </h2>
          <div
            className="relative w-full overflow-hidden border border-[var(--rule-light)] bg-black"
            style={{ paddingBottom: "56.25%" }}
          >
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube.com/embed/${activeTrack.videoId}?rel=0&modestbranding=1&color=white&autoplay=1`}
              title={`${activeTrack.artist} — ${activeTrack.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="eager"
            />
          </div>

          {/* Track info + controls */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-headline-serif text-sm font-bold text-[var(--ink)]">
                {activeTrack.artist} &mdash; {activeTrack.title}
              </p>
              <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                {activeTrack.duration !== "unknown" && (
                  <span>{activeTrack.duration}</span>
                )}
                {activeTrack.channel && (
                  <span className={activeTrack.duration !== "unknown" ? "ml-2" : ""}>
                    via {activeTrack.channel}
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={handleLike}
                className={`px-2 py-1 font-mono text-[10px] transition-colors ${
                  likeState === "like"
                    ? "font-bold text-[var(--ink)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
                aria-label="Like this track"
              >
                +1
              </button>
              <button
                type="button"
                onClick={handleDislike}
                className={`px-2 py-1 font-mono text-[10px] transition-colors ${
                  likeState === "dislike"
                    ? "font-bold text-[var(--accent-red)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--accent-red)]"
                }`}
                aria-label="Dislike this track"
              >
                -1
              </button>
              <span className="mx-1 text-[var(--rule)]">|</span>
              <button
                type="button"
                onClick={playPrev}
                className="px-2 py-1 font-mono text-[10px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                aria-label="Previous track"
              >
                &laquo; Prev
              </button>
              <button
                type="button"
                onClick={playNext}
                className="px-2 py-1 font-mono text-[10px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                aria-label="Next track"
              >
                Next &raquo;
              </button>
            </div>
          </div>

          {/* Genre pills */}
          {activeTrack.genres.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {activeTrack.genres.slice(0, 5).map((g) => (
                <span
                  key={g}
                  className="border border-[var(--rule-light)] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Shuffle Button ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={dig}
        disabled={loading}
        className="mb-4 w-full border border-[var(--rule)] py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-40"
      >
        {loading ? "Digging..." : "Shuffle"}
      </button>

      {/* ── Track List ──────────────────────────────────────────────── */}
      {tracks.length > 0 && (
        <div className="divide-y divide-[var(--rule-light)] border border-[var(--rule-light)]">
          {tracks.map((track, i) => {
            const isActive = activeTrack?.id === track.id;
            const signal = getSignalForTrack(track.id);

            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                  isActive ? "bg-[var(--rule-light)]" : ""
                }`}
              >
                {/* Track number */}
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
                    onClick={() => handlePlay(track)}
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
                  onClick={() => handlePlay(track)}
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
                    {track.channel && track.channel !== track.artist && (
                      <span className="ml-1.5 opacity-60">
                        via {track.channel}
                      </span>
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
                    onClick={() => handleTrackLike(track)}
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
                    onClick={() => handleTrackDislike(track)}
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

      {!loading && tracks.length === 0 && (
        <p className="py-8 text-center font-mono text-[10px] text-[var(--ink-faint)]">
          No tracks found. Hit shuffle.
        </p>
      )}
    </div>
  );
}
