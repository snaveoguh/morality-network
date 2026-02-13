"use client";

import { useAccount } from "wagmi";
import { TipButton } from "@/components/entity/TipButton";
import { computeEntityHash } from "@/lib/entity";
import type { StumbleItem } from "@/lib/stumble";
import Link from "next/link";

interface StumbleCardProps {
  item: StumbleItem;
}

const TYPE_ICONS: Record<string, string> = {
  article: "📰",
  video: "🎬",
  image: "🖼️",
  discussion: "💬",
  wiki: "📚",
};

const TYPE_COLORS: Record<string, string> = {
  article: "bg-[#2F80ED]/10 text-[#2F80ED] border-[#2F80ED]/30",
  video: "bg-[#D0021B]/10 text-[#D0021B] border-[#D0021B]/30",
  image: "bg-[#31F387]/10 text-[#31F387] border-[#31F387]/30",
  discussion: "bg-orange-400/10 text-orange-400 border-orange-400/30",
  wiki: "bg-purple-400/10 text-purple-400 border-purple-400/30",
};

export function StumbleCard({ item }: StumbleCardProps) {
  const { isConnected } = useAccount();
  const entityHash = computeEntityHash(item.url);

  return (
    <div className="stumble-page flex flex-col">
      {/* Full-bleed hero */}
      <div className="relative flex-1">
        {/* Background image */}
        {item.imageUrl && (
          <div className="absolute inset-0 z-0">
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
          </div>
        )}

        {/* No image fallback — gradient bg */}
        {!item.imageUrl && (
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />
        )}

        {/* Content overlay */}
        <div className="relative z-10 flex h-full flex-col justify-end p-6 sm:p-10">
          {/* Type + Source badges */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                TYPE_COLORS[item.type] || TYPE_COLORS.article
              }`}
            >
              {TYPE_ICONS[item.type] || "📰"} {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
            </span>

            <span className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300">
              <img
                src={item.sourceIcon}
                alt=""
                className="h-3.5 w-3.5 rounded-sm"
                loading="lazy"
              />
              {item.source}
            </span>

            {item.score > 100 && (
              <span className="rounded-full bg-[#D0021B]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#D0021B]">
                Viral
              </span>
            )}
          </div>

          {/* Title — big Cooper Black */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/title mb-3"
          >
            <h1 className="font-headline text-3xl leading-tight text-white transition-colors group-hover/title:text-[#2F80ED] sm:text-4xl md:text-5xl">
              {item.title}
            </h1>
          </a>

          {/* Description */}
          {item.description && (
            <p className="font-comic mb-5 max-w-3xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              {item.description}
            </p>
          )}

          {/* Author + metadata */}
          <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            {item.author && (
              <span className="font-comic">
                by <span className="text-white">{item.author}</span>
              </span>
            )}
            {item.subreddit && (
              <span className="font-comic text-orange-400">
                r/{item.subreddit}
              </span>
            )}
            <span className="font-comic">
              {new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Stats + Actions bar */}
          <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
            {/* Engagement stats */}
            <div className="flex items-center gap-4 text-sm">
              {item.score > 0 && (
                <span className="flex items-center gap-1.5 text-[#31F387]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  {item.score.toLocaleString()}
                </span>
              )}
              {item.commentCount > 0 && (
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {item.commentCount.toLocaleString()} comments
                </span>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Open original */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-comic rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-[#2F80ED] hover:text-white"
              >
                Open Source ↗
              </a>

              {/* Discuss on MO */}
              <Link
                href={`/entity/${entityHash}`}
                className="font-comic rounded-lg border border-[#2F80ED]/30 bg-[#2F80ED]/10 px-4 py-2 text-sm text-[#2F80ED] transition-colors hover:bg-[#2F80ED]/20"
              >
                Discuss on MO
              </Link>

              {/* Tip */}
              {isConnected && <TipButton entityHash={entityHash} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
