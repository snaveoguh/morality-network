import Link from "next/link";
import { ArchiveSkeleton } from "@/components/archive/ArchiveSkeleton";

export default function Loading() {
  return (
    <section className="mx-auto max-w-4xl py-8">
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <div className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <Link href="/" className="transition-colors hover:text-[var(--ink)]">
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Archive</span>
        </div>
        <h1 className="font-headline text-3xl leading-tight text-[var(--ink)] md:text-4xl">
          The Archive
        </h1>
      </div>
      <ArchiveSkeleton />
    </section>
  );
}
