"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function ArticleNotFound() {
  const params = useParams();
  const hash = typeof params?.hash === "string" ? params.hash : "";

  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <h1 className="font-headline text-4xl text-[var(--ink)]">
        Article Not Yet Recovered
      </h1>
      <p className="mt-3 font-body-serif text-sm italic text-[var(--ink-light)]">
        We attempted automatic recovery from archive + onchain registry, but this
        hash still has no recoverable source URL.
      </p>
      <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
        Onchain discussion is still available for this entity hash.
      </p>
      <div className="mt-6">
        {hash && (
          <div className="mb-3 flex justify-center gap-4">
            <Link
              href={`/entity/${hash}`}
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] underline underline-offset-4 decoration-[var(--rule)] transition-colors hover:text-[var(--ink)]"
            >
              Open Entity Ledger
            </Link>
            <Link
              href={`/discuss/${hash}`}
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] underline underline-offset-4 decoration-[var(--rule)] transition-colors hover:text-[var(--ink)]"
            >
              Open Discussion Room
            </Link>
          </div>
        )}
        <Link
          href="/"
          className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)] transition-colors hover:text-[var(--accent-red)]"
        >
          &larr; Return to Front Page
        </Link>
      </div>
    </div>
  );
}
