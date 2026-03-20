"use client";

import { useState, useEffect, useCallback } from "react";
import type { NounMarketItem } from "@/lib/nouns-marketplace";
import { NounCard } from "./NounCard";

const SORT_OPTIONS = [
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "id-desc", label: "Newest" },
  { value: "id-asc", label: "Oldest" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "listed", label: "Listed" },
];

export function NounsMarketplace() {
  const [items, setItems] = useState<NounMarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("price-asc");
  const [status, setStatus] = useState("all");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", sort, status });
      const res = await fetch(`/api/nouns/listings?${params}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sort, status]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div>
      {/* ── Masthead ── */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-4xl sm:text-5xl text-[var(--ink)]">
          Nouns Marketplace
        </h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          Buy and sell Nouns NFTs with 0% marketplace fees.
          Direct peer-to-peer trading via Seaport 1.6 on Ethereum.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-center gap-0 border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider">
        {/* Status */}
        {STATUS_OPTIONS.map((opt, i) => (
          <span key={opt.value} className="flex shrink-0 items-center">
            {i > 0 && <span className="mx-1 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setStatus(opt.value)}
              className={`transition-colors ${
                status === opt.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {opt.label}
            </button>
          </span>
        ))}

        <span className="mx-3 shrink-0 text-[var(--rule-light)]">&middot;</span>

        {/* Sort */}
        {SORT_OPTIONS.map((opt, i) => (
          <span key={opt.value} className="flex shrink-0 items-center">
            {i > 0 && <span className="mx-1 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setSort(opt.value)}
              className={`transition-colors ${
                sort === opt.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {opt.label}
            </button>
          </span>
        ))}

        <span className="ml-auto shrink-0 text-[var(--ink-faint)]">
          {items.length} items
        </span>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse border border-[var(--rule-light)] bg-[var(--paper-dark)]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          No Nouns match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <NounCard key={item.nounId} noun={item} />
          ))}
        </div>
      )}
    </div>
  );
}
