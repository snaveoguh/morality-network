"use client";

// ============================================================================
// MemoHeader — thin top band, all-caps, vol/issue/edition stripe.
// Lives above the main column. Pure ink-on-paper, single 1px rule below.
// ============================================================================

import Link from "next/link";
import { useMemo } from "react";
import { BRAND_NAME } from "@/lib/brand";

// Site went live for our purposes on 2026-03-11 → edition 1.
const EPOCH = new Date("2026-03-11T00:00:00Z").getTime();

export function MemoHeader() {
  const { dateStr, edition, isoDate, filedTime } = useMemo(() => {
    const now = new Date();
    const e = Math.floor((now.getTime() - EPOCH) / 86_400_000) + 1;
    const ds = now
      .toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
      .toUpperCase();
    const iso = now.toISOString().slice(0, 10);
    const ft = now
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Denver",
      });
    return { dateStr: ds, edition: e, isoDate: iso, filedTime: ft };
  }, []);

  const volume = 1;
  const issue = edition;

  return (
    <header className="border-b border-[var(--rule)] bg-[var(--paper)]">
      <div className="flex items-baseline justify-between gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-bold tracking-[0.22em] hover:underline">
            {BRAND_NAME.toUpperCase()}
          </Link>
          <span className="hidden sm:inline">VOL. {volume}</span>
          <span className="hidden sm:inline">NO. {issue}</span>
          <span className="hidden md:inline">EDITION {isoDate}</span>
        </div>
        <div className="flex items-baseline gap-3 text-[var(--ink-faint)]">
          <span>FILED {filedTime} MST</span>
          <span className="hidden sm:inline">PAGE 1 OF MANY</span>
        </div>
      </div>
      <div className="h-[3px] border-y border-[var(--rule)]" />
      <div className="px-3 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        {dateStr}
      </div>
    </header>
  );
}
