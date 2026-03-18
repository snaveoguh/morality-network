"use client";

import Link from "next/link";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
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
  const rawPreview = item.canonicalClaim || item.description;
  // Suppress preview if it's just parroting the headline
  const previewText = rawPreview && !isDuplicateOfTitle(rawPreview, item.title)
    ? rawPreview
    : undefined;

  return (
    <article className="group border border-[var(--rule-light)] bg-[var(--paper)] p-5 transition-colors hover:border-[var(--rule)]">
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
            <span className="font-medium text-[var(--ink)]">{item.source}</span>
            <span className="text-[var(--rule)]">|</span>
            <span className="border border-[var(--rule-light)] px-1.5 py-0.5 text-[var(--ink-faint)]">
              {item.category}
            </span>
            <span className="text-[var(--ink-faint)]">{timeSince}</span>
          </div>

          {/* Title — links to internal article page */}
          <Link
            href={`/article/${entityHash}`}
            className="font-headline mb-1.5 block text-lg text-[var(--ink)] transition-colors group-hover:text-[var(--ink-light)]"
          >
            {item.title}
          </Link>

          {/* Description — Comic Neue */}
          {previewText && (
            <p className="font-body-serif mb-3 line-clamp-2 text-sm text-[var(--ink-light)]">
              {previewText}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <StarRating rating={0} size="sm" count={0} />

            <Link
              href={buildEntityUrl(entityHash, { url: item.link, title: item.title, source: item.source, type: "link" })}
              className="uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
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

/** Returns true when the preview text is just a restatement of the headline. */
function isDuplicateOfTitle(preview: string, title: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const p = normalize(preview);
  const t = normalize(title);
  if (!p || !t) return false;
  // Exact match, one contains the other, or >80% overlap
  if (p === t || t.startsWith(p) || p.startsWith(t)) return true;
  const pWords = new Set(p.split(" "));
  const tWords = new Set(t.split(" "));
  const overlap = [...pWords].filter((w) => tWords.has(w)).length;
  return overlap / Math.max(pWords.size, tWords.size) > 0.8;
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
