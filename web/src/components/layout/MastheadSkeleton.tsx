// ============================================================================
// MASTHEAD SKELETON — instant lofi placeholder while daily edition loads
// ============================================================================

import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";

export function MastheadSkeleton() {
  // Static dateline — no data dependency
  const today = new Date();
  const editionNumber =
    Math.floor(
      (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000
    ) + 1;
  const dateStr = today
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
  const chainTag = CONTRACTS_CHAIN_ID === 84532 ? "BASE SEPOLIA" : "BASE L2";
  const dateline = `${dateStr} · EDITION ${editionNumber} · ${chainTag}`;

  return (
    <div className="border-y border-[var(--rule)]">
      {/* Real dateline — no data needed */}
      <div className="border-b border-[var(--rule-light)] py-[3px] text-center font-mono text-[8px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        {dateline}
      </div>

      {/* Pulsing headline skeleton */}
      <div className="px-4 py-5 text-center sm:py-6">
        {/* Daily title bar */}
        <div className="mx-auto mb-3 h-2 w-24 animate-pulse bg-[var(--rule-light)]" />
        {/* Headline bars */}
        <div className="mx-auto mb-2 h-7 w-4/5 animate-pulse bg-[var(--rule-light)] sm:h-9" />
        <div className="mx-auto mb-3 h-7 w-3/5 animate-pulse bg-[var(--rule-light)] sm:h-9" />
        {/* Subheadline */}
        <div className="mx-auto h-4 w-2/5 animate-pulse bg-[var(--rule-light)]/60" />
      </div>
    </div>
  );
}
