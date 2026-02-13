"use client";

import { useState, useMemo } from "react";
import { FeedItem } from "./FeedItem";
import { CastCard } from "./CastCard";
import type { FeedItem as FeedItemType } from "@/lib/rss";
import type { Cast } from "@/lib/farcaster";

interface MixedFeedProps {
  rssItems: FeedItemType[];
  casts: Cast[];
}

type ContentItem =
  | { type: "rss"; data: FeedItemType; sortTime: number }
  | { type: "cast"; data: Cast; sortTime: number };

const CATEGORIES = ["All", "World", "Tech", "Crypto", "Farcaster"];

export function MixedFeed({ rssItems, casts }: MixedFeedProps) {
  const [activeCategory, setActiveCategory] = useState("All");

  // Merge all content into a single chronological stream
  // Farcaster casts are interspersed among RSS items
  const mixed = useMemo(() => {
    const items: ContentItem[] = [];

    // Add RSS items
    for (const item of rssItems) {
      items.push({
        type: "rss",
        data: item,
        sortTime: new Date(item.pubDate).getTime(),
      });
    }

    // Add Farcaster casts
    for (const cast of casts) {
      items.push({
        type: "cast",
        data: cast,
        sortTime: new Date(cast.timestamp).getTime(),
      });
    }

    // Sort by time (newest first)
    items.sort((a, b) => b.sortTime - a.sortTime);

    return items;
  }, [rssItems, casts]);

  // Filter by category
  const filtered = useMemo(() => {
    if (activeCategory === "All") return mixed;
    if (activeCategory === "Farcaster")
      return mixed.filter((item) => item.type === "cast");
    return mixed.filter(
      (item) =>
        item.type === "rss" && (item.data as FeedItemType).category === activeCategory
    );
  }, [mixed, activeCategory]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-comic rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? cat === "Farcaster"
                    ? "bg-[#8A63D2]/10 text-[#8A63D2]"
                    : "bg-[#2F80ED]/10 text-[#2F80ED]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {cat}
              {cat === "Farcaster" && casts.length > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">{casts.length}</span>
              )}
            </button>
          ))}
        </div>

        <span className="font-comic text-xs text-zinc-600">
          {filtered.length} items
        </span>
      </div>

      {/* The chaotic mixed feed */}
      <div className="space-y-3">
        {filtered.map((item, i) => {
          if (item.type === "cast") {
            return (
              <CastCard
                key={`cast-${(item.data as Cast).hash}`}
                cast={item.data as Cast}
              />
            );
          }
          return (
            <FeedItem
              key={`rss-${(item.data as FeedItemType).id}`}
              item={item.data as FeedItemType}
            />
          );
        })}

        {filtered.length === 0 && (
          <div className="font-comic py-12 text-center text-zinc-500">
            Nothing here yet. The void stares back.
          </div>
        )}
      </div>
    </div>
  );
}
