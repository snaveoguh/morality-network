// ============================================================================
// MASTHEAD SKELETON — instant placeholder while daily edition loads.
// Workstation styling: 1-bit, no animated pulses, just dither.
// ============================================================================

import { CONTRACTS_CHAIN_ID } from "@/lib/contracts";

export function MastheadSkeleton() {
  const today = new Date();
  const editionNumber =
    Math.floor(
      (today.getTime() - new Date("2026-03-11T00:00:00Z").getTime()) / 86400000,
    ) + 1;
  const dateStr = today
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
  const chainTag = CONTRACTS_CHAIN_ID === 84532 ? "Base Sepolia" : "Base L2";

  return (
    <div className="border-b border-[var(--ink)] bg-[var(--bg)] px-4 py-3">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-[var(--ink)] mb-2">
        <span>{dateStr}</span>
        <span>Edition {editionNumber}</span>
        <span>{chainTag}</span>
      </div>
      <h2 className="fm-section-title text-center mb-1">pooter.world — daily edition</h2>
      <div className="border-b border-[var(--ink)] mb-3" />
      <div className="mx-auto mb-2 h-2 w-32 dither-50" />
      <div className="mx-auto mb-2 h-6 w-3/5 dither-50" />
      <div className="mx-auto mb-2 h-6 w-2/5 dither-50" />
      <div className="mx-auto h-3 w-1/3 dither-25" />
    </div>
  );
}
