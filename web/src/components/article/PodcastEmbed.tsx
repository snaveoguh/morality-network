"use client";

import { useEffect, useId, useMemo } from "react";
import type { PodcastEpisode } from "@/lib/article";

interface PodcastEmbedProps {
  episode: PodcastEpisode;
  sourceName: string;
}

function toSpotifyEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (!/^https?:\/\/open\.spotify\.com\//i.test(clean)) return null;
  if (/\/embed\//i.test(clean)) return clean;
  return clean.replace("open.spotify.com/", "open.spotify.com/embed/");
}

function toAppleEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim();
  if (!/^https?:\/\/podcasts\.apple\.com\//i.test(clean)) return null;
  if (/^https?:\/\/embed\.podcasts\.apple\.com\//i.test(clean)) return clean;
  return clean.replace("podcasts.apple.com/", "embed.podcasts.apple.com/");
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function PodcastEmbed({ episode, sourceName }: PodcastEmbedProps) {
  const duration = formatDuration(episode.durationSeconds);
  const embedId = useId();
  const targetId = useMemo(
    () => `podcast-${embedId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [embedId],
  );
  const spotifyUrl = useMemo(
    () => (episode.platformLinks || []).find((link) => /spotify/i.test(link.name))?.url || null,
    [episode.platformLinks],
  );
  const appleUrl = useMemo(
    () => (episode.platformLinks || []).find((link) => /apple/i.test(link.name))?.url || null,
    [episode.platformLinks],
  );
  const spotifyEmbedUrl = useMemo(() => toSpotifyEmbedUrl(spotifyUrl), [spotifyUrl]);
  const appleEmbedUrl = useMemo(() => toAppleEmbedUrl(appleUrl), [appleUrl]);
  const hasDirectIframeEmbed = Boolean(spotifyEmbedUrl || appleEmbedUrl);
  const hasAudio = Boolean(episode.audioUrl);
  const hasEmbedScript = Boolean(episode.embedScriptUrl) && !hasDirectIframeEmbed;

  useEffect(() => {
    if (!episode.embedScriptUrl || hasDirectIframeEmbed) return;

    const target = document.getElementById(targetId);
    if (!target) return;
    if (target.childNodes.length > 0) return;

    const script = document.createElement("script");
    script.src = `${episode.embedScriptUrl}${episode.embedScriptUrl.includes("?") ? "&" : "?"}target=${encodeURIComponent(targetId)}`;
    script.async = true;
    target.appendChild(script);

    return () => {
      if (target.contains(script)) {
        target.removeChild(script);
      }
    };
  }, [episode.embedScriptUrl, hasDirectIframeEmbed, targetId]);

  return (
    <section className="mb-8 border-t border-[var(--rule-light)] pt-6">
      <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
        Listen
      </h2>

      <div className="border border-[var(--rule-light)] bg-[var(--paper)] p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          {episode.imageUrl ? (
            <img
              src={episode.imageUrl}
              alt={episode.title}
              className="h-28 w-28 border border-[var(--rule-light)] object-cover md:h-32 md:w-32"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              {episode.showTitle || sourceName}
              {episode.provider ? ` · ${episode.provider}` : ""}
              {duration ? ` · ${duration}` : ""}
            </p>

            <h3 className="mt-1 font-headline text-2xl leading-tight text-[var(--ink)]">
              {episode.title}
            </h3>

            {episode.summary ? (
              <p className="mt-2 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                {episode.summary}
              </p>
            ) : null}

            {spotifyEmbedUrl ? (
              <iframe
                src={spotifyEmbedUrl}
                title={`${episode.title} on Spotify`}
                className="mt-4 h-[232px] w-full overflow-hidden border border-[var(--rule-light)]"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            ) : null}

            {!spotifyEmbedUrl && appleEmbedUrl ? (
              <iframe
                src={appleEmbedUrl}
                title={`${episode.title} on Apple Podcasts`}
                className="mt-4 h-[232px] w-full overflow-hidden border border-[var(--rule-light)] bg-white"
                allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                loading="lazy"
              />
            ) : null}

            {hasEmbedScript ? (
              <div
                id={targetId}
                className="mt-4 min-h-[244px] overflow-hidden border border-[var(--rule-light)]"
              />
            ) : null}

            {hasAudio && !hasEmbedScript ? (
              <audio
                controls
                preload="none"
                className="mt-4 w-full"
                src={episode.audioUrl || undefined}
              >
                Your browser does not support the audio element.
              </audio>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              {episode.audioUrl ? (
                <a
                  href={episode.audioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--rule)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
                >
                  Open Audio
                </a>
              ) : null}
              {(episode.platformLinks || []).map((link) => (
                <a
                  key={`${link.name}:${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--rule)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
