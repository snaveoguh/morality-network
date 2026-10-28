import { Suspense } from "react";
import Link from "next/link";
import { AsyncChart, ChartSkeleton } from "@/components/charts/AsyncChart";
import type { ChartId } from "@/lib/charts/queries";
import { withBrand } from "@/lib/brand";

export const revalidate = 900; // 15 min ISR — chart queries cache 15–30 min
export const maxDuration = 30;

export const metadata = {
  title: withBrand("Data"),
  description:
    "Charts drawn live from what pooter.world reads and records: the news feed by outlet bias, and the Claim Ledger by sitting and party.",
};

const SECTIONS: Array<{ heading: string; ids: ChartId[] }> = [
  { heading: "The feed", ids: ["feed-bias", "feed-category"] },
  { heading: "The Claim Ledger", ids: ["claims-per-pmqs", "claims-by-party", "ledger-growth"] },
];

export default function DataPage() {
  return (
    <section className="mx-auto max-w-4xl px-3 py-8 sm:px-0">
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link href="/" className="transition-colors hover:text-[var(--ink)]">
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Data</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">The Numbers</h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Charts drawn from what we already read and record. Each one refreshes
          on its own as the feed and the ledger update; the date under each
          chart is when its data was last read.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <div key={section.heading} className="mb-10">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {section.heading}
          </h2>
          <div className="space-y-8">
            {section.ids.map((id) => (
              <Suspense key={id} fallback={<ChartSkeleton />}>
                <AsyncChart id={id} />
              </Suspense>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
