"use client";

import { useState, useCallback, useTransition } from "react";
import { StumbleCard } from "./StumbleCard";
import type { StumbleItem } from "@/lib/stumble";

interface StumbleViewProps {
  initialItems: StumbleItem[];
}

export function StumbleView({ initialItems }: StumbleViewProps) {
  const [items, setItems] = useState<StumbleItem[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [history, setHistory] = useState<number[]>([0]);

  const currentItem = items[currentIndex];

  // Go to next random item
  const stumble = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setHistory((prev) => [...prev, nextIndex]);
    } else {
      // Ran out of items — fetch more
      setIsRefreshing(true);
      fetch("/api/stumble")
        .then((res) => res.json())
        .then((newItems: StumbleItem[]) => {
          if (Array.isArray(newItems) && newItems.length > 0) {
            setItems(newItems);
            setCurrentIndex(0);
            setHistory([0]);
          }
        })
        .catch(console.error)
        .finally(() => setIsRefreshing(false));
    }
  }, [currentIndex, items.length]);

  // Go back in history
  const goBack = useCallback(() => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop();
      setHistory(newHistory);
      setCurrentIndex(newHistory[newHistory.length - 1]);
    }
  }, [history]);

  // Filter by type
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const filteredItems = typeFilter
    ? items.filter((item) => item.type === typeFilter)
    : items;

  if (!currentItem) {
    return (
      <div className="stumble-page flex items-center justify-center">
        <div className="text-center">
          <div className="font-headline mb-4 text-4xl text-white">
            Nothing to Stumble Upon
          </div>
          <p className="font-comic mb-6 text-zinc-400">
            The internet is vast but sometimes... empty.
          </p>
          <button
            onClick={stumble}
            className="font-comic rounded-xl bg-[#2F80ED] px-8 py-3 text-lg font-bold text-white transition-all hover:bg-[#2F80ED]/80 hover:scale-105"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stumble-page relative flex flex-col">
      {/* The content card */}
      <div className="flex-1">
        <StumbleCard item={currentItem} />
      </div>

      {/* Stumble controls — fixed bottom bar */}
      <div className="sticky bottom-0 z-50 border-t border-white/10 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Left: navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              disabled={history.length <= 1}
              className="font-comic rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-30"
            >
              ← Back
            </button>
            <span className="font-comic text-xs text-zinc-600">
              {currentIndex + 1} / {items.length}
            </span>
          </div>

          {/* Center: THE STUMBLE BUTTON */}
          <button
            onClick={stumble}
            disabled={isRefreshing}
            className="font-headline group relative overflow-hidden rounded-xl bg-[#2F80ED] px-8 py-3 text-lg text-white shadow-lg shadow-[#2F80ED]/20 transition-all hover:bg-[#2F80ED]/90 hover:shadow-xl hover:shadow-[#2F80ED]/30 active:scale-95 disabled:opacity-50"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Loading...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Stumble
              </span>
            )}
          </button>

          {/* Right: type filters */}
          <div className="flex items-center gap-1">
            {["article", "video", "discussion", "wiki"].map((type) => (
              <button
                key={type}
                onClick={() =>
                  setTypeFilter(typeFilter === type ? null : type)
                }
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === type
                    ? "bg-[#2F80ED]/10 text-[#2F80ED]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {type === "article"
                  ? "📰"
                  : type === "video"
                    ? "🎬"
                    : type === "discussion"
                      ? "💬"
                      : "📚"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
