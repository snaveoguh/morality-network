"use client";

// ============================================================================
// SpotifyEmbed — compact Spotify player for daily music pick
// Uses Spotify's free oEmbed iframe (no API key required).
// ============================================================================

interface SpotifyEmbedProps {
  trackId: string;
  title?: string;
  caption?: string;
}

export function SpotifyEmbed({ trackId, title, caption }: SpotifyEmbedProps) {
  return (
    <figure className="my-6">
      <div className="relative w-full overflow-hidden border border-[var(--rule-light)]">
        <iframe
          className="w-full"
          style={{ height: "152px", borderRadius: 0 }}
          src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`}
          title={title || "Spotify track"}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
      {(title || caption) && (
        <figcaption className="mt-2 font-mono text-[9px] italic leading-relaxed text-[var(--ink-faint)]">
          {title && <span className="font-bold not-italic">{title}</span>}
          {title && caption && <span> &mdash; </span>}
          {caption && <span>{caption}</span>}
        </figcaption>
      )}
    </figure>
  );
}
