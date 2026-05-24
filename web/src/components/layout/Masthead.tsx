"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";
import { EditionsPanel } from "@/components/editions/EditionsPanel";

// ============================================================================
// MASTHEAD — Xerox PARC memo title block (replaces the front-page banner)
//
// ╔════════════════════════════════════════════╗
// ║ ░░ INTEROFFICE MEMORANDUM ░░░░░░░░░░░░░░░░ ║   ← dither bar + title
// ║                                            ║
// ║  POOTER WORLD                              ║   ← bitmap headline
// ║  A PERMISSIONLESS NEWS NETWORK             ║   ← subtitle (small caps)
// ║                                            ║
// ║  FILED: WED MAR 11 14:23 MST · EDITION 801 ║
// ║  TODAY'S HEADLINE / SUBHEADLINE            ║
// ╚════════════════════════════════════════════╝
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

  const { dateStr, filedTime, editionNumber } = useMemo(() => {
    const today = new Date();
    const num =
      Math.floor(
        (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000,
      ) + 1;
    const ds = today
      .toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
      .toUpperCase();
    const ft = today.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Denver",
    });
    return { dateStr: ds, filedTime: ft, editionNumber: num };
  }, []);

  return (
    <section className="border border-[var(--rule)]" aria-label="Masthead">
      {/* Dither bar with INTEROFFICE MEMORANDUM band */}
      <div className="relative flex items-center justify-between border-b border-[var(--rule)] bg-[var(--paper)]">
        <div className="dither-50 h-6 w-12 border-r border-[var(--rule)]" aria-hidden />
        <div className="px-2 font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--ink)]">
          INTEROFFICE MEMORANDUM
        </div>
        <div className="dither-50 h-6 w-12 border-l border-[var(--rule)]" aria-hidden />
      </div>

      {/* Big bitmap-styled title block */}
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <h1 className="bitmap-title text-[44px] leading-[0.94] text-[var(--ink)] sm:text-[60px] lg:text-[78px]">
          {BRAND_NAME.toUpperCase()}
        </h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--ink)]">
          A PERMISSIONLESS NEWS NETWORK
        </p>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[var(--rule-thin)] pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          <span>FILED {dateStr} {filedTime} MST</span>
          <button
            onClick={() => setShowEditions(true)}
            className="cursor-pointer underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            EDITION {editionNumber}
          </button>
          <span>
            CHAIN {CONTRACTS_CHAIN_ID === 84532 ? "BASE/SEPOLIA" : "BASE/L2"}
          </span>
        </div>
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}

      {/* Today's lead — appears beneath the title block, framed by rules */}
      {dailyHeadline && dailyHash ? (
        <div className="border-t border-[var(--rule)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px,1fr]">
            <div className="border-r-0 sm:border-r sm:border-[var(--rule-thin)] sm:pr-3">
              <div className="label-sm text-[var(--ink-faint)]">
                TODAY'S LEAD
              </div>
              {showDailyTitle && (
                <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink)]">
                  {normalizedDailyTitle}
                </div>
              )}
            </div>
            <div>
              <Link
                href={`/article/${dailyHash}`}
                className="group block"
              >
                <h2 className="text-[26px] font-bold uppercase leading-[1.05] tracking-[-0.005em] text-[var(--ink)] group-hover:underline sm:text-[34px]">
                  {stripMd(dailyHeadline)}
                </h2>
              </Link>
              {dailySubheadline && (
                <p className="mt-2 text-[13px] italic leading-[1.4] text-[var(--ink-light)]">
                  {stripMd(dailySubheadline)}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
