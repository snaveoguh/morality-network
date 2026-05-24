"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";
import { EditionsPanel } from "@/components/editions/EditionsPanel";
import { Founders } from "@/components/workstation/Founders";

// ============================================================================
// MASTHEAD — Workstation document title block
//
// Renders as the top of the FrameMaker document: small section header,
// founders grid, daily headline + subheadline, then the body flows below.
// ============================================================================

interface MastheadProps {
  dailyTitle?: string | null;
  dailyHeadline?: string | null;
  dailySubheadline?: string | null;
  dailyHash?: string | null;
}

function stripMd(s: string | null | undefined): string | null | undefined {
  if (!s) return s;
  return s.replace(/\*{1,3}/g, "").replace(/_{1,3}/g, "").replace(/^#+\s+/, "");
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
    const num =
      Math.floor(
        (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000,
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
    <div className="border-b border-[var(--ink)] bg-[var(--bg)] px-4 py-3">
      {/* Dateline — looks like a FrameMaker page header */}
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--ink)] mb-2">
        <span>{dateStr}</span>
        <button
          onClick={() => setShowEditions(true)}
          className="hover:underline cursor-pointer"
        >
          Edition {editionNumber}
        </button>
        <span>{CONTRACTS_CHAIN_ID === 84532 ? "Base Sepolia" : "Base L2"}</span>
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}

      {/* Section heading — "Text in Three Columns" mimic */}
      <h2 className="fm-section-title text-center mb-1">
        {BRAND_NAME.toLowerCase()} — daily edition
      </h2>
      <div className="border-b border-[var(--ink)] mb-3" />

      {/* Sub-section label — Frame Technology Corporate Profile mimic */}
      <h3 className="fm-subhead text-center">
        Pooter Operating Co — Daily Profile
      </h3>

      {/* Founders grid — drop-in homage to Frame's founders */}
      <Founders />

      {/* Daily headline block */}
      <div className="text-center mt-2">
        {dailyHeadline && dailyHash ? (
          <>
            {showDailyTitle && (
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--ink)]">
                {normalizedDailyTitle}
              </p>
            )}
            <Link href={`/article/${dailyHash}`} className="group block">
              <h1 className="font-headline text-2xl font-bold leading-tight text-[var(--ink)] group-hover:underline sm:text-3xl">
                {stripMd(dailyHeadline)}
              </h1>
            </Link>
            {dailySubheadline && (
              <p className="mx-auto mt-2 max-w-2xl font-serif text-sm italic leading-relaxed text-[var(--ink-soft)]">
                {stripMd(dailySubheadline)}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="font-headline text-2xl font-bold leading-none text-[var(--ink)] sm:text-3xl">
              {BRAND_NAME}
            </h1>
            <p className="mt-1 font-serif text-xs italic text-[var(--ink-soft)]">
              A public ledger of world events and their interpretation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
