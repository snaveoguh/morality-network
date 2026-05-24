"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";
import { EditionsPanel } from "@/components/editions/EditionsPanel";

// ============================================================================
// MASTHEAD — NeXTSTEP document title panel
//
// Edition · date · chain (small caps, dark on slate)
// ──────────────────────────────────────────────
//   POOTER WORLD                     (Helvetica Black 48pt+)
//   Daily Edition · Wed 12 Mar       (slate caption)
//   ════════════════════════════════ (NeXT-red 2px rule)
//   Hero headline                    (Helvetica Bold ~32pt)
//   Subheadline                      (Helvetica Regular)
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
    <section className="bg-[var(--bg)]">
      {/* Slate caption bar — small caps */}
      <div className="next-panel flex items-center justify-between border-b border-black/30 px-3 py-1 text-[10px]">
        <span className="small-caps text-[var(--ink)]">
          {dateStr}
        </span>
        <button
          onClick={() => setShowEditions(true)}
          className="small-caps text-[var(--ink)] hover:text-[var(--accent-red)] transition-colors"
        >
          ▸ Edition {editionNumber}
        </button>
        <span className="small-caps text-[var(--ink)]">
          {CONTRACTS_CHAIN_ID === 84532 ? "Base Sepolia" : "Base L2"}
        </span>
      </div>

      {showEditions && (
        <EditionsPanel
          currentEdition={editionNumber}
          onClose={() => setShowEditions(false)}
        />
      )}

      {/* Hero block — Helvetica Black */}
      <div className="px-4 py-6 sm:py-8">
        <h1
          className="font-masthead text-[40px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)] sm:text-[60px] lg:text-[72px]"
          style={{ fontWeight: 900 }}
        >
          {BRAND_NAME.toUpperCase()}
        </h1>

        {showDailyTitle && (
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)] small-caps">
            {normalizedDailyTitle}
          </p>
        )}

        {/* NeXT-red rule */}
        <div className="mt-3 h-[2px] w-full bg-[var(--accent-red)]" />

        {dailyHeadline && dailyHash ? (
          <Link href={`/article/${dailyHash}`} className="group mt-4 block">
            <h2 className="text-2xl font-bold leading-[1.15] tracking-[-0.015em] text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)] sm:text-3xl lg:text-4xl">
              {stripMd(dailyHeadline)}
            </h2>
            {dailySubheadline && (
              <p className="mt-2 max-w-2xl text-sm leading-snug text-[var(--ink-soft)] sm:text-base">
                {stripMd(dailySubheadline)}
              </p>
            )}
          </Link>
        ) : (
          <p className="mt-4 max-w-2xl text-sm leading-snug text-[var(--ink-soft)]">
            A public ledger of world events and their interpretation.
          </p>
        )}
      </div>

      {/* Thin separator before feed */}
      <div className="border-b border-black/30" />
    </section>
  );
}
