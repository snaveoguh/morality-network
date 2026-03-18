"use client";

import { useState, useEffect, useCallback } from "react";
import type { PepeFeedItem } from "@/lib/pepe";
import { PepeCard } from "./PepeCard";

const SORT_OPTIONS = [
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "rarest", label: "Rarest" },
  { value: "series", label: "Series" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "listed", label: "Listed" },
  { value: "unlisted", label: "Unlisted" },
];

export function PepeMarketplace() {
  const [listings, setListings] = useState<PepeFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState("all");
  const [sort, setSort] = useState("price-asc");
  const [status, setStatus] = useState("all");

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "60",
        sort,
        status,
        ...(series !== "all" ? { series } : {}),
      });
      const res = await fetch(`/api/pepe/listings?${params}`);
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [series, sort, status]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return (
    <div>
      {/* ── Masthead ── */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-4xl sm:text-5xl text-[var(--ink)]">
          Rare Pepe Exchange
        </h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          1,774 certified cards from the original Counterparty collection (2016&ndash;2018).
          Trade via Emblem Vault on Ethereum.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-center gap-0 border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider">
        {/* Series */}
        <span className="mr-2 shrink-0 text-[var(--ink-faint)]">Series</span>
        <button
          onClick={() => setSeries("all")}
          className={`shrink-0 transition-colors ${
            series === "all"
              ? "font-bold text-[var(--ink)] underline underline-offset-4"
              : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
          }`}
        >
          All
        </button>
        {Array.from({ length: 36 }, (_, i) => i + 1).map((s) => (
          <span key={s} className="flex shrink-0 items-center">
            <span className="mx-1 text-[var(--rule-light)]">|</span>
            <button
              onClick={() => setSeries(String(s))}
              className={`transition-colors ${
                series === String(s)
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {s}
            </button>
          </span>
        ))}

        <span className="mx-3 shrink-0 text-[var(--rule-light)]">&middot;</span>

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
          {listings.length} items
        </span>
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse border border-[var(--rule-light)] bg-[var(--paper-dark)]"
            />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="py-16 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          No Pepes match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listings.map((pepe) => (
            <PepeCard key={`${pepe.asset}-${pepe.emblemTokenId || ""}`} pepe={pepe} />
          ))}
        </div>
      )}
    </div>
  );
}
