"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import {
  UNDERGROUND_PLAYLIST,
  getDailyTrack,
  CATEGORY_LABELS,
  type YouTubeTrack,
  type Category,
} from "@/lib/music";

// ============================================================================
// MusicPlayer — YouTube underground playlist with mini video player
// ============================================================================

export function MusicPlayer() {
  const dailyTrack = useMemo(() => getDailyTrack(), []);
  const [activeTrack, setActiveTrack] = useState<YouTubeTrack>(dailyTrack);
  const [category, setCategory] = useState<Category>("all");
  const [showAll, setShowAll] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  // Shuffle playlist deterministically by day so it feels fresh
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

  const handleTrackClick = useCallback(
    (track: YouTubeTrack) => {
      setActiveTrack(track);
      // Scroll player into view on mobile
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  const playNext = useCallback(() => {
    const idx = filtered.findIndex((t) => t.videoId === activeTrack.videoId);
    const next = filtered[(idx + 1) % filtered.length];
    setActiveTrack(next);
  }, [filtered, activeTrack]);

  const playPrev = useCallback(() => {
    const idx = filtered.findIndex((t) => t.videoId === activeTrack.videoId);
    const prev = filtered[(idx - 1 + filtered.length) % filtered.length];
    setActiveTrack(prev);
  }, [filtered, activeTrack]);

  return (
    <div>
      {/* ── Video Player ─────────────────────────────────────────────── */}
      <section ref={playerRef} className="mb-6">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Now Playing
        </h2>
        <div className="relative w-full overflow-hidden border border-[var(--rule-light)] bg-black"
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
          <div className="flex shrink-0 items-center gap-1">
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

      {/* ── Track List ───────────────────────────────────────────────── */}
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
    </div>
  );
}
