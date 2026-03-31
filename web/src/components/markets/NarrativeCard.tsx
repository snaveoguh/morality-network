"use client";

import Link from "next/link";
import type {
  MacroNarrative,
  NarrativeCategory,
  NarrativeSentiment,
} from "@/lib/narratives";
import { narrativeCategoryLabel } from "@/lib/narratives";

const SENTIMENT_STYLES: Record<
  NarrativeSentiment,
  { label: string; color: string; bg: string }
> = {
  bullish: {
    label: "BULLISH",
    color: "text-green-700",
    bg: "bg-green-100",
  },
  bearish: {
    label: "BEARISH",
    color: "text-red-700",
    bg: "bg-red-100",
  },
  neutral: {
    label: "NEUTRAL",
    color: "text-zinc-600",
    bg: "bg-zinc-100",
  },
  contested: {
    label: "CONTESTED",
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
};

const CATEGORY_COLORS: Record<NarrativeCategory, string> = {
  "macro-risk": "border-red-300 text-red-700",
  "monetary-policy": "border-blue-300 text-blue-700",
  "sector-rotation": "border-purple-300 text-purple-700",
  geopolitical: "border-orange-300 text-orange-700",
  "crypto-native": "border-emerald-300 text-emerald-700",
};

interface NarrativeCardProps {
  narrative: MacroNarrative;
}

export function NarrativeCard({ narrative }: NarrativeCardProps) {
  const sentiment = SENTIMENT_STYLES[narrative.sentiment];
  const categoryColor = CATEGORY_COLORS[narrative.category];

  return (
    <Link
      href={`/entity/${narrative.entityHash}?title=${encodeURIComponent(narrative.title)}&type=narrative&description=${encodeURIComponent(narrative.description)}`}
      className="block border border-[var(--rule)] p-4 transition-colors hover:bg-[var(--paper-dark,#f8f5f0)]"
    >
      {/* Header: category + sentiment */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.15em] ${categoryColor}`}
        >
          {narrativeCategoryLabel(narrative.category)}
        </span>
        <span
          className={`px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.15em] ${sentiment.color} ${sentiment.bg}`}
        >
          {sentiment.label}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-headline text-base leading-tight text-[var(--ink)]">
        {narrative.title}
      </h3>

      {/* Description */}
      <p className="mt-1.5 font-body-serif text-[13px] leading-relaxed text-[var(--ink-light)]">
        {narrative.description}
      </p>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Rate &amp; discuss &rarr;
        </span>
        {narrative.source === "editorial-ai" && (
          <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            AI-surfaced
          </span>
        )}
      </div>
    </Link>
  );
}
