"use client";

import Link from "next/link";
import { computeEntityHash } from "@/lib/entity";
import { StarRating } from "@/components/shared/StarRating";
import { TipButton } from "@/components/entity/TipButton";
import { useAccount } from "wagmi";
import type { FeedItem as FeedItemType } from "@/lib/rss";

interface FeedItemProps {
  item: FeedItemType;
}

export function FeedItem({ item }: FeedItemProps) {
  const { isConnected } = useAccount();
  const entityHash = computeEntityHash(item.link);
  const timeSince = getTimeSince(item.pubDate);

  return (
    <article className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-zinc-700">
      <div className="flex gap-4">
        {/* Image */}
        {item.imageUrl && (
          <div className="hidden h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg sm:block">
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Source + Category */}
          <div className="mb-1.5 flex items-center gap-2 text-xs font-comic">
            <span className="font-medium text-[#31F387]">{item.source}</span>
            <span className="text-zinc-600">|</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
              {item.category}
            </span>
            <span className="text-zinc-600">{timeSince}</span>
          </div>

          {/* Title — Cooper Black / newspaper style */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-headline mb-1.5 block text-lg text-white transition-colors group-hover:text-[#2F80ED]"
          >
            {item.title}
          </a>

          {/* Description — Comic Neue */}
          <p className="font-comic mb-3 line-clamp-2 text-sm text-zinc-400">
            {item.description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 font-comic">
            <StarRating rating={0} size="sm" count={0} />

            <Link
              href={`/entity/${entityHash}`}
              className="text-xs text-zinc-500 transition-colors hover:text-[#2F80ED]"
            >
              Discuss
            </Link>

            {isConnected && <TipButton entityHash={entityHash} />}
          </div>
        </div>
      </div>
    </article>
  );
}

function getTimeSince(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
