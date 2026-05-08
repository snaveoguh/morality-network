import Link from "next/link";
import { getRecentPooterOriginals, type PooterOriginal } from "@/lib/editorial-archive";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 600; // 10 min ISR
export const maxDuration = 30;

export const metadata = {
  title: withBrand("Pooter Originals"),
  description: `Every editorial authored by ${BRAND_NAME}'s AI desk. The full byline.`,
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function formatDateParts(iso: string): { day: string; month: string; weekday: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { day: "2-digit" }),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
  };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()}`;
}

export default async function OriginalsPage() {
  const all = await withTimeout(
    getRecentPooterOriginals(false, 300, true),
    10000,
    [] as PooterOriginal[],
  );

  const sorted = [...all].sort(
    (a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );

  // Group by month
  const byMonth = new Map<string, PooterOriginal[]>();
  for (const item of sorted) {
    const key = monthKey(item.generatedAt);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(item);
  }

  // Tally
  const dailyCount = sorted.filter((i) => i.isDailyEdition).length;
  const illustratedCount = sorted.filter((i) => i.hasIllustration).length;

  return (
    <section className="mx-auto max-w-5xl py-8">
      {/* Header */}
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link
            href="/"
            className="transition-colors hover:text-[var(--ink)]"
          >
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Pooter Originals</span>
        </div>
        <h1 className="font-headline text-4xl text-[var(--ink)] md:text-6xl">
          Pooter Originals
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base italic leading-relaxed text-[var(--ink-light)]">
          Every editorial written by the {BRAND_NAME} AI desk. Includes daily
          editions, market commentary, and one-off long reads.
        </p>

        {/* Tally row */}
        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          <span>
            <strong className="text-[var(--ink)]">{sorted.length}</strong>{" "}
            {sorted.length === 1 ? "piece" : "pieces"}
          </span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>
            <strong className="text-[var(--ink)]">{dailyCount}</strong> daily editions
          </span>
          <span className="text-[var(--rule-light)]">|</span>
          <span>
            <strong className="text-[var(--ink)]">{illustratedCount}</strong> illustrated
          </span>
        </div>
      </header>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-8 text-center">
          <p className="font-headline-serif text-xl text-[var(--ink)]">
            No originals cached yet.
          </p>
          <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            Editorial generation runs on a cron. Check back shortly.
          </p>
        </div>
      )}

      {/* By month */}
      <div className="space-y-12">
        {Array.from(byMonth.entries()).map(([month, items]) => (
          <section key={month}>
            <div className="mb-4 flex items-baseline justify-between border-b border-[var(--rule-light)] pb-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
                {month}
              </h2>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {items.length} {items.length === 1 ? "piece" : "pieces"}
              </span>
            </div>

            <ul className="divide-y divide-[var(--rule-light)]">
              {items.map((item) => {
                const { day, month: mo, weekday } = formatDateParts(item.generatedAt);
                return (
                  <li key={item.hash}>
                    <Link
                      href={`/article/${item.hash}`}
                      className="group flex items-start gap-4 py-4"
                    >
                      {/* Compact date stamp */}
                      <div className="w-14 shrink-0 border-r border-[var(--rule-light)] pr-3 text-right">
                        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                          {weekday}
                        </p>
                        <p className="font-headline text-2xl leading-none text-[var(--ink)]">
                          {day}
                        </p>
                        <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                          {mo}
                        </p>
                      </div>

                      {/* Body */}
                      <div className="min-w-0 flex-1">
                        {/* Tags row */}
                        <div className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.2em]">
                          {item.isDailyEdition && (
                            <span className="border border-[var(--accent-red)] bg-[var(--accent-red)] px-1.5 py-0.5 font-bold text-[var(--paper)]">
                              Daily
                            </span>
                          )}
                          <span className="text-[var(--ink-light)]">
                            {item.category}
                          </span>
                          {item.hasIllustration && (
                            <>
                              <span className="text-[var(--rule-light)]">
                                &middot;
                              </span>
                              <span className="text-[var(--ink-faint)]">
                                Illustrated
                              </span>
                            </>
                          )}
                          {item.editedBy && (
                            <>
                              <span className="text-[var(--rule-light)]">
                                &middot;
                              </span>
                              <span className="text-[var(--ink-faint)]">
                                edited by {item.editedBy}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="font-headline-serif text-lg font-bold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)] md:text-xl">
                          {item.title}
                        </h3>

                        {/* Subheadline */}
                        {item.subheadline && (
                          <p className="mt-1 line-clamp-2 font-body-serif text-sm italic leading-relaxed text-[var(--ink-light)]">
                            {item.subheadline}
                          </p>
                        )}

                        {/* Tag chips */}
                        {item.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.slice(0, 5).map((tag) => (
                              <span
                                key={tag}
                                className="border border-[var(--rule-light)] px-1.5 py-0 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Colophon */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_NAME} &bull; pooter originals &bull; AI-authored, human-reviewed
        </p>
      </footer>
    </section>
  );
}
