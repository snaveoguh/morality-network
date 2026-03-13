"use client";

import { useCallback, type MouseEvent } from "react";
import { openCenteredPopup, shouldKeepDefaultLinkBehavior } from "@/lib/popup";

// ============================================================================
// YouTubeEmbed — responsive 16:9 iframe with optional caption
// Uses youtube-nocookie.com for privacy-respecting embeds.
// ============================================================================

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  caption?: string;
}

export function YouTubeEmbed({ videoId, title, caption }: YouTubeEmbedProps) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const openMiniWindow = useCallback(() => {
    const popup = openCenteredPopup(watchUrl, {
      width: 980,
      height: 620,
      name: `yt_${videoId}`,
    });
    if (!popup) {
      window.open(watchUrl, "_blank", "noopener,noreferrer");
    }
  }, [videoId, watchUrl]);

  const onWatchClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (shouldKeepDefaultLinkBehavior(event)) return;
      event.preventDefault();
      openMiniWindow();
    },
    [openMiniWindow]
  );

  return (
    <figure className="my-6">
      <div
        className="relative w-full overflow-hidden border border-[var(--rule-light)] bg-black"
        style={{ paddingBottom: "56.25%" }}
      >
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
          title={title || "Video embed"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {(title || caption) && (
        <figcaption className="mt-2 font-mono text-[9px] italic leading-relaxed text-[var(--ink-faint)]">
          {title && <span className="font-bold not-italic">{title}</span>}
          {title && caption && <span> &mdash; </span>}
          {caption && <span>{caption}</span>}
          <span className="mt-2 flex items-center gap-3 text-[8px] not-italic uppercase tracking-[0.12em]">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWatchClick}
              className="underline decoration-[var(--rule)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
            >
              Open YouTube
            </a>
            <button
              type="button"
              onClick={openMiniWindow}
              className="font-bold transition-colors hover:text-[var(--ink)]"
            >
              Mini Window
            </button>
          </span>
        </figcaption>
      )}
    </figure>
  );
}
