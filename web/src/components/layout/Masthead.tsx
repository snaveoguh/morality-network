"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";
import { EditionsPanel } from "@/components/editions/EditionsPanel";
import { stripMd } from "@/lib/strip-md";

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
    <div className="overflow-hidden rounded-lg bg-[var(--brand-navy)] text-white">
      {/* Dateline — thin ruled bar */}
      <div className="border-b border-white/15 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
        {dateStr} &middot;{" "}
        <button
          onClick={() => setShowEditions(true)}
          className="cursor-pointer underline-offset-2 transition-colors hover:text-[var(--brand-teal)] hover:underline"
        >
          EDITION {editionNumber}
        </button>
        {" "}&middot; {CONTRACTS_CHAIN_ID === 84532 ? "BASE SEPOLIA" : "BASE L2"}
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}

      {/* Hero headline block — left-aligned GOV.UK color band */}
      <div className="px-6 py-9 sm:px-10 sm:py-12">
        {dailyHeadline && dailyHash ? (
          <>
            {/* Daily title — teal eyebrow above headline */}
            {showDailyTitle && (
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-teal)]">
                {normalizedDailyTitle}
              </p>
            )}

            {/* Hero headline — THE front page story */}
            <Link href={`/article/${dailyHash}`} className="group block">
              <h1 className="font-headline max-w-5xl text-4xl font-extrabold leading-[1.04] tracking-tight text-white transition-colors group-hover:text-[var(--brand-teal)] sm:text-5xl lg:text-6xl">
                {stripMd(dailyHeadline)}
              </h1>
            </Link>

            <div className="mt-6 h-[5px] w-20 rounded bg-[var(--brand-teal)]" />

            {dailySubheadline && (
              <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/75 sm:text-lg">
                {stripMd(dailySubheadline)}
              </p>
            )}
          </>
        ) : (
          <>
            {/* Fallback when no daily edition */}
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--brand-teal)]">
              {BRAND_NAME}
            </p>
            <h1 className="font-headline max-w-5xl text-4xl font-extrabold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              A public ledger of world events and their interpretation.
            </h1>
            <div className="mt-6 h-[5px] w-20 rounded bg-[var(--brand-teal)]" />
          </>
        )}
      </div>
    </div>
  );
}
