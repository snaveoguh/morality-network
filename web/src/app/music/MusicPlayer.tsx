"use client";

import { useState, useMemo } from "react";
import { WARTIME_PLAYLIST, getDailyTrack, type MusicTrack } from "@/lib/music";

// ============================================================================
// MusicPlayer — full wartime playlist with Spotify embeds
// ============================================================================

export function MusicPlayer() {
  const dailyTrack = useMemo(() => getDailyTrack(), []);
  const [activeTrack, setActiveTrack] = useState<MusicTrack>(dailyTrack);
  const [showAll, setShowAll] = useState(false);

  // Shuffle playlist deterministically by day so it feels fresh
  const shuffled = useMemo(() => {
    const now = new Date();
    const seed = now.getUTCFullYear() * 1000 + now.getUTCMonth() * 31 + now.getUTCDate();
    const arr = [...WARTIME_PLAYLIST];
    // Fisher-Yates with deterministic seed
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = ((s * 1103515245 + 12345) & 0x7fffffff);
      const j = s % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);

  const displayList = showAll ? shuffled : shuffled.slice(0, 20);

  return (
    <div>
      {/* Now Playing */}
      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Now Playing
        </h2>
        <div className="border border-[var(--rule-light)] bg-[var(--paper)]">
          <iframe
            className="w-full"
            style={{ height: "152px", borderRadius: 0 }}
            src={`https://open.spotify.com/embed/track/${activeTrack.spotifyId}?utm_source=generator&theme=0`}
            title={`${activeTrack.artist} — ${activeTrack.title}`}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="eager"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="font-mono text-[9px] text-[var(--ink-faint)]">
            Today&rsquo;s pick: <span className="font-bold text-[var(--ink-light)]">{dailyTrack.artist} &mdash; {dailyTrack.title}</span>
          </p>
          <a
            href={`https://open.spotify.com/track/${activeTrack.spotifyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink)]"
          >
            Open in Spotify
          </a>
        </div>
      </section>

      {/* Full Playlist */}
      <section>
        <h2 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Full Rotation &middot; {WARTIME_PLAYLIST.length} tracks
        </h2>

        <div className="divide-y divide-[var(--rule-light)] border border-[var(--rule-light)]">
          {displayList.map((track, i) => {
            const isActive = track.spotifyId === activeTrack.spotifyId;
            const isDaily = track.spotifyId === dailyTrack.spotifyId;

            return (
              <button
                key={track.spotifyId}
                type="button"
                onClick={() => setActiveTrack(track)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--rule-light)] ${
                  isActive ? "bg-[var(--rule-light)]" : ""
                }`}
              >
                <span className="w-6 font-mono text-[9px] text-[var(--ink-faint)]">
                  {isActive ? (
                    <span className="text-[var(--ink)]">&blacktriangleright;</span>
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block truncate font-headline-serif text-sm ${isActive ? "font-bold text-[var(--ink)]" : "text-[var(--ink-light)]"}`}>
                    {track.title}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-[var(--ink-faint)]">
                    {track.artist}
                  </span>
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

        {!showAll && shuffled.length > 20 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-4 w-full border border-[var(--rule-light)] py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)]"
          >
            Show all {shuffled.length} tracks
          </button>
        )}
      </section>
    </div>
  );
}
