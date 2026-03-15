"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  UNDERGROUND_PLAYLIST,
  getDailyTrack,
  CATEGORY_LABELS,
  type YouTubeTrack,
  type Category,
} from "@/lib/music";
import type { DiscoveryTrack } from "@/lib/music-types";
import {
  recordSignal,
  getSignalForTrack,
} from "@/lib/music-taste";
import { DiscoveryFeed } from "./DiscoveryFeed";

// ============================================================================
// MusicPlayer — YouTube underground playlist with taste engine
// ============================================================================

type ActiveTrack = {
  videoId: string;
  title: string;
  artist: string;
  duration: string;
  genres: string[];
  trackId: string;
};

function curatedToActive(t: YouTubeTrack): ActiveTrack {
  return {
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    genres: t.genres || [],
    trackId: t.videoId,
  };
}

function discoveredToActive(t: DiscoveryTrack): ActiveTrack {
  return {
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    genres: t.genres,
    trackId: t.id,
  };
}

export function MusicPlayer() {
  const dailyTrack = useMemo(() => getDailyTrack(), []);
  const [activeTrack, setActiveTrack] = useState<ActiveTrack>(
    curatedToActive(dailyTrack),
  );
  const [category, setCategory] = useState<Category>("all");
  const [showAll, setShowAll] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const [likeState, setLikeState] = useState<"like" | "dislike" | null>(null);

  useEffect(() => {
    setLikeState(getSignalForTrack(activeTrack.trackId));
  }, [activeTrack.trackId]);

  const shuffled = useMemo(() => {
    const now = new Date();
    const seed =
      now.getUTCFullYear() * 1000 +
      now.getUTCMonth() * 31 +
      now.getUTCDate();
    const arr = [...UNDERGROUND_PLAYLIST];
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);

  const filtered = useMemo(() => {
    if (category === "all") return shuffled;
    return shuffled.filter((t) => t.category === category);
  }, [shuffled, category]);

  const displayList = showAll ? filtered : filtered.slice(0, 20);

  const handleTrackClick = useCallback((track: YouTubeTrack) => {
    const active = curatedToActive(track);
    setActiveTrack(active);
    recordSignal({
      trackId: active.trackId,
      artist: active.artist,
      genres: active.genres,
      action: "play",
    });
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleDiscoveryPlay = useCallback((track: DiscoveryTrack) => {
    const active = discoveredToActive(track);
    setActiveTrack(active);
    recordSignal({
      trackId: active.trackId,
      artist: active.artist,
      genres: active.genres,
      action: "play",
    });
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const playNext = useCallback(() => {
    const idx = filtered.findIndex((t) => t.videoId === activeTrack.videoId);
    if (idx === -1) {
      setActiveTrack(curatedToActive(filtered[0]));
      return;
    }
    const next = filtered[(idx + 1) % filtered.length];
    setActiveTrack(curatedToActive(next));
  }, [filtered, activeTrack]);

  const playPrev = useCallback(() => {
    const idx = filtered.findIndex((t) => t.videoId === activeTrack.videoId);
    if (idx === -1) {
      setActiveTrack(curatedToActive(filtered[0]));
      return;
    }
    const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
    setActiveTrack(curatedToActive(prev));
  }, [filtered, activeTrack]);

  const handleLike = useCallback(() => {
    recordSignal({
      trackId: activeTrack.trackId,
      artist: activeTrack.artist,
      genres: activeTrack.genres,
      action: "like",
    });
    setLikeState("like");
  }, [activeTrack]);

  const handleDislike = useCallback(() => {
    recordSignal({
      trackId: activeTrack.trackId,
      artist: activeTrack.artist,
      genres: activeTrack.genres,
      action: "dislike",
    });
    setLikeState("dislike");
  }, [activeTrack]);

  return (
    <div>
      {/* ── Video Player ─────────────────────────────────────────────── */}
      <section ref={playerRef} className="mb-6">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Now Playing
        </h2>
        <div
          className="relative w-full overflow-hidden border border-[var(--rule-light)] bg-black"
          style={{ paddingBottom: "56.25%" /* 16:9 */ }}
        >
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${activeTrack.videoId}?rel=0&modestbranding=1&color=white`}
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
              {activeTrack.duration}
              {activeTrack.videoId === dailyTrack.videoId && (
                <span className="ml-2 border border-[var(--rule)] px-1 py-0.5 uppercase tracking-wider">
                  Today&apos;s Pick
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
            {activeTrack.genres.map((g) => (
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

      {/* ── Category Tabs ────────────────────────────────────────────── */}
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-[var(--rule-light)] pb-3">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
          const count =
            cat === "all"
              ? UNDERGROUND_PLAYLIST.length
              : UNDERGROUND_PLAYLIST.filter((t) => t.category === cat).length;
          if (count === 0 && cat !== "all") return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategory(cat);
                setShowAll(false);
              }}
              className={`px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                category === cat
                  ? "bg-[var(--ink)] text-[var(--paper)] font-bold"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--rule-light)]"
              }`}
            >
              {CATEGORY_LABELS[cat]}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Curated Track List ───────────────────────────────────────── */}
      <section>
        <div className="divide-y divide-[var(--rule-light)] border border-[var(--rule-light)]">
          {displayList.map((track, i) => {
            const isActive = track.videoId === activeTrack.videoId;
            const isDaily = track.videoId === dailyTrack.videoId;

            return (
              <button
                key={track.videoId}
                type="button"
                onClick={() => handleTrackClick(track)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--rule-light)] ${
                  isActive ? "bg-[var(--rule-light)]" : ""
                }`}
              >
                <span className="w-6 font-mono text-[9px] text-[var(--ink-faint)]">
                  {isActive ? (
                    <span className="text-[var(--accent-red)]">&#9654;</span>
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span className="min-w-0 flex-1">
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
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[8px] text-[var(--ink-faint)]">
                  {track.duration}
                </span>
                {isDaily && (
                  <span className="shrink-0 border border-[var(--rule)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!showAll && filtered.length > 20 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-4 w-full border border-[var(--rule-light)] py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)]"
          >
            Show all {filtered.length} tracks
          </button>
        )}

        {filtered.length === 0 && (
          <p className="py-8 text-center font-mono text-[10px] text-[var(--ink-faint)]">
            No tracks in this category yet.
          </p>
        )}
      </section>

      {/* ── Discovery Feed ───────────────────────────────────────────── */}
      <DiscoveryFeed
        onPlayTrack={handleDiscoveryPlay}
        activeVideoId={activeTrack.videoId}
      />
    </div>
  );
}
