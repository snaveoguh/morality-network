import { BRAND_NAME } from "@/lib/brand";

// ============================================================================
// ParallelWorldFooter — Manifesto footer for daily edition articles
// Static component. The parallel world boilerplate.
// ============================================================================

export function ParallelWorldFooter() {
  return (
    <footer className="mt-12 border-t-2 border-[var(--rule)] pt-8 pb-12">
      {/* Title */}
      <div className="mb-6 text-center">
        <h2 className="font-headline text-3xl font-bold text-[var(--ink)] sm:text-4xl">
          {BRAND_NAME}
        </h2>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          A public ledger of world events and their interpretation.
        </p>
      </div>

      {/* Manifesto */}
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          We are building a parallel world. One of abundance, autonomy, privacy,
          dignity, and human rights &mdash; coordinated through open protocols,
          not captured institutions.
        </p>

        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)]">
          Every transaction is a vote. Every protocol is a constitution.
          Every block is an edition.
        </p>

        <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          The old world governs through opacity and coercion.
          The parallel world governs through transparency and choice.
          You are reading the record.
        </p>
      </div>

      {/* Chain badge */}
      <div className="mt-8 flex items-center justify-center gap-3 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        <span>Ethereum</span>
        <span className="text-[var(--rule-light)]">|</span>
        <span>Base L2</span>
        <span className="text-[var(--rule-light)]">|</span>
        <span>Permissionless</span>
        <span className="text-[var(--rule-light)]">|</span>
        <span>Onchain</span>
      </div>
    </footer>
  );
}
