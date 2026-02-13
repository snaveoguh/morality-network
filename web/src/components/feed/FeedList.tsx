"use client";

import { useState } from "react";
import { FeedItem } from "./FeedItem";
import type { FeedItem as FeedItemType } from "@/lib/rss";

interface FeedListProps {
  items: FeedItemType[];
}

const CATEGORIES = ["All", "World", "Tech", "Crypto"];

export function FeedList({ items }: FeedListProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"latest" | "discussed" | "tipped">(
    "latest"
  );

  const filtered =
    activeCategory === "All"
      ? items
      : items.filter((item) => item.category === activeCategory);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        {/* Category tabs */}
        <div className="flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-[#2F80ED]/10 text-[#31F387]"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Sort:</span>
          {(
            [
              ["latest", "Latest"],
              ["discussed", "Most Discussed"],
              ["tipped", "Most Tipped"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSortBy(value)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                sortBy === value
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed items */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <FeedItem key={item.id} item={item} />
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-zinc-500">
            No items found for this category.
          </div>
        )}
      </div>
    </div>
  );
}
