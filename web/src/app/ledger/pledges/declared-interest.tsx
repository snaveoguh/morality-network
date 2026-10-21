// Declared-interest note for the Pledge Ledger. Shown on every pledge page:
// the co-op that publishes this ledger may itself apply to programmes it
// tracks, and readers should know that before they read a status.

export function DeclaredInterest() {
  return (
    <aside className="border-l-4 border-[var(--accent-red)] bg-[var(--paper-dark)] px-4 py-3">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--accent-red)]">
        Declared interest
      </p>
      <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink)]">
        This ledger is published by Morality Co-operative Ltd, a worker
        co-operative. Morality Co-operative may apply to programmes this page
        tracks &mdash; including the Co-operative Development Programme. Pledges
        where that applies are marked. Statuses are set from the public record
        only, and every one links to its source.
      </p>
    </aside>
  );
}
