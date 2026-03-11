"use client";

import Link from "next/link";

export default function EntityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl py-10">
      <div className="border-b-2 border-[var(--rule)] pb-4 mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent-red)]">
          Entity Error
        </p>
        <h1 className="mt-1 font-headline text-2xl leading-tight text-[var(--ink)] sm:text-3xl">
          Could not load this entity profile.
        </h1>
        <p className="mt-3 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Contract reads or RPC connectivity may be temporarily unavailable.
          Your onchain data is safe.
        </p>
        <p className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">
          {error.message}
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={reset}
          className="border border-[var(--rule)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          &larr; Return to Front Page
        </Link>
      </div>
    </section>
  );
}
