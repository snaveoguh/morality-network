import type { PledgeStatus } from "@/lib/ledger/pledges";

export const STATUS_LABEL: Record<PledgeStatus, string> = {
  announced: "Announced",
  allocated: "Allocated",
  spent: "Spent",
  delivered: "Delivered",
  unknown: "Unknown",
};

// Ink for the confirmed end of the track, union red for "unknown" — the one
// state that says the record doesn't settle it.
const STATUS_CLASS: Record<PledgeStatus, string> = {
  announced: "border-[var(--rule)] text-[var(--ink-light)]",
  allocated: "border-[var(--ink)] text-[var(--ink)]",
  spent: "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]",
  delivered: "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]",
  unknown: "border-[var(--accent-red)] text-[var(--accent-red)]",
};

export function StatusBadge({ status }: { status: PledgeStatus }) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
