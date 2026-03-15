"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { EditionsPanel } from "@/components/editions/EditionsPanel";

// ============================================================================
// MASTHEAD — Newspaper front-page banner
//
// ┌─────────────────────────────────────────┐
// │  WED, 11 MAR 2026 · EDITION 801 · BASE L2 │
// │─────────────────────────────────────────│
// │  Iran's shadow war meets the fruit     │  ← Daily headline (the hero)
// │  fly's digital brain while oil chokes  │
// │  the global throat.                     │
// │                                         │
// │  Three cargo ships struck, one          │  ← Subheadline
// │  synthetic brain walking.               │
// └─────────────────────────────────────────┘
// ============================================================================

interface MastheadProps {
  dailyTitle?: string | null;
  dailyHeadline?: string | null;
  dailySubheadline?: string | null;
  dailyHash?: string | null;
}

export function Masthead({
  dailyTitle,
  dailyHeadline,
  dailySubheadline,
  dailyHash,
}: MastheadProps) {
  const normalizedDailyTitle = (dailyTitle || "").trim();
  const showDailyTitle =
    normalizedDailyTitle.length > 0 &&
    !/^daily edition$/i.test(normalizedDailyTitle) &&
    !/^pooter\s+world$/i.test(normalizedDailyTitle);

  const [showEditions, setShowEditions] = useState(false);

  const { dateStr, editionNumber } = useMemo(() => {
    const today = new Date();
    const num = Math.floor(
      (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000
    ) + 1;
    const ds = today
      .toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();
    return { dateStr: ds, editionNumber: num };
  }, []);

  return (
    <div className="border-y border-[var(--rule)]">
      {/* Dateline — thin ruled bar */}
      <div className="border-b border-[var(--rule-light)] py-[3px] text-center font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        {dateStr} &middot;{" "}
        <button
          onClick={() => setShowEditions(true)}
          className="cursor-pointer underline-offset-2 transition-colors hover:text-[var(--ink)] hover:underline"
        >
          EDITION {editionNumber}
        </button>
        {" "}&middot; BASE L2
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}

      {/* Hero headline block */}
      <div className="px-4 py-5 text-center sm:py-6">
        {dailyHeadline && dailyHash ? (
          <>
            {/* Daily title — small signal word above headline */}
            {showDailyTitle && (
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--ink-faint)]">
                {normalizedDailyTitle}
              </p>
            )}

            {/* Hero headline — THE front page story */}
            <Link
              href={`/article/${dailyHash}`}
              className="group block"
            >
              <h1 className="font-headline text-2xl font-bold leading-[1.15] text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)] sm:text-3xl lg:text-4xl">
                {dailyHeadline}
              </h1>
            </Link>

            {dailySubheadline && (
              <p className="mx-auto mt-3 max-w-2xl font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)] sm:text-base">
                {dailySubheadline}
              </p>
            )}
          </>
        ) : (
          <>
            {/* Fallback when no daily edition */}
            <h1 className="font-headline text-3xl font-bold leading-none text-[var(--ink)] sm:text-4xl lg:text-5xl">
              {BRAND_NAME}
            </h1>
            <p className="mt-2 font-body-serif text-xs italic text-[var(--ink-light)] sm:text-sm">
              A public ledger of world events and their interpretation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
