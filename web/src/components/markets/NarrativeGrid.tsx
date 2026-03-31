"use client";

import { useState } from "react";
import type { MacroNarrative, NarrativeCategory } from "@/lib/narratives";
import { narrativeCategoryLabel } from "@/lib/narratives";
import { NarrativeCard } from "./NarrativeCard";

const ALL_CATEGORIES: NarrativeCategory[] = [
  "macro-risk",
  "monetary-policy",
  "sector-rotation",
  "geopolitical",
  "crypto-native",
];

interface NarrativeGridProps {
  narratives: MacroNarrative[];
}

export function NarrativeGrid({ narratives }: NarrativeGridProps) {
  const [filter, setFilter] = useState<NarrativeCategory | "all">("all");

  const filtered =
    filter === "all"
      ? narratives
      : narratives.filter((n) => n.category === filter);

  return (
    <div>
      {/* Category filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
            filter === "all"
              ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
              : "border-[var(--rule)] text-[var(--ink-faint)] hover:border-[var(--ink)]"
          }`}
        >
          All ({narratives.length})
        </button>
        {ALL_CATEGORIES.map((cat) => {
          const count = narratives.filter((n) => n.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] transition-colors ${
                filter === cat
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                  : "border-[var(--rule)] text-[var(--ink-faint)] hover:border-[var(--ink)]"
              }`}
            >
              {narrativeCategoryLabel(cat)} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((narrative) => (
          <NarrativeCard key={narrative.id} narrative={narrative} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          No narratives in this category yet.
        </p>
      )}
    </div>
  );
}
