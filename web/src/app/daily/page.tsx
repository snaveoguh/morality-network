import Link from "next/link";
import { getRecentPooterOriginals, type PooterOriginal } from "@/lib/editorial-archive";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const revalidate = 600; // 10 min ISR
export const maxDuration = 30;

export const metadata = {
  title: withBrand("Daily Editions"),
  description: `Every daily edition published by ${BRAND_NAME}. The morning paper, archived.`,
};

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function formatDateParts(iso: string): { day: string; month: string; year: string; weekday: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { day: "2-digit" }),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    year: d.toLocaleDateString("en-US", { year: "numeric" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()}`;
}

export default async function DailyEditionsPage() {
  const all = await withTimeout(
    getRecentPooterOriginals(false, 300, true),
    10000,
    [] as PooterOriginal[],
  );

  const editions = all
    .filter((item) => item.isDailyEdition)
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );

  // Group by month
  const byMonth = new Map<string, PooterOriginal[]>();
  for (const item of editions) {
    const key = monthKey(item.generatedAt);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(item);
  }

  return (
    <section className="mx-auto max-w-5xl py-8">
      {/* Masthead-style header */}
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <Link
            href="/"
            className="transition-colors hover:text-[var(--ink)]"
          >
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Daily Editions</span>
        </div>
        <h1 className="font-masthead text-5xl text-[var(--ink)] md:text-7xl">
          The Daily Editions
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base italic leading-relaxed text-[var(--ink-light)]">
          Every front page {BRAND_NAME} has ever published, in reverse
          chronological order. {editions.length}{" "}
          {editions.length === 1 ? "edition" : "editions"} preserved.
        </p>
        <div className="mt-4 h-px bg-[var(--rule)]" />
        <div className="mt-px h-[2px] bg-[var(--rule)]" />
      </header>

      {/* Empty state */}
      {editions.length === 0 && (
        <div className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30 p-8 text-center">
          <p className="font-headline-serif text-xl text-[var(--ink)]">
            No daily editions cached yet.
          </p>
          <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
            The newsroom cron runs every 2 hours. Check back shortly.
          </p>
        </div>
      )}

      {/* Editions grouped by month */}
      <div className="space-y-12">
        {Array.from(byMonth.entries()).map(([month, items]) => (
          <section key={month}>
            <div className="mb-4 flex items-baseline justify-between border-b border-[var(--rule-light)] pb-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
                {month}
              </h2>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {items.length} {items.length === 1 ? "edition" : "editions"}
              </span>
            </div>

            <ul className="divide-y divide-[var(--rule-light)]">
              {items.map((edition) => {
                const { day, month: mo, weekday } = formatDateParts(edition.generatedAt);
                return (
                  <li key={edition.hash}>
                    <Link
                      href={`/article/${edition.hash}`}
                      className="group flex flex-col gap-3 py-5 transition-colors md:flex-row md:gap-6"
                    >
                      {/* Date stamp */}
                      <div className="flex shrink-0 flex-col items-start gap-0.5 md:w-32">
                        <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
                          {weekday}
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-headline text-4xl leading-none text-[var(--ink)]">
                            {day}
                          </span>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-light)]">
                            {mo}
                          </span>
                        </div>
                      </div>

                      {/* Edition content */}
                      <div className="min-w-0 flex-1">
                        {edition.dailyTitle && (
                          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent-red)]">
                            {edition.dailyTitle}
                          </p>
                        )}
                        <h3 className="mt-1 font-headline text-2xl leading-tight text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)] md:text-3xl">
                          {edition.title}
                        </h3>
                        {edition.subheadline && (
                          <p className="mt-2 font-body-serif text-base italic leading-relaxed text-[var(--ink-light)]">
                            {edition.subheadline}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                          {edition.hasIllustration && (
                            <>
                              <span>Illustrated</span>
                              <span className="text-[var(--rule-light)]">|</span>
                            </>
                          )}
                          {edition.tags.slice(0, 4).map((tag, idx) => (
                            <span key={tag}>
                              {idx > 0 && (
                                <span className="mr-2 text-[var(--rule-light)]">
                                  |
                                </span>
                              )}
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Arrow */}
                      <span className="hidden shrink-0 self-center font-mono text-xs text-[var(--ink-faint)] transition-colors group-hover:text-[var(--ink)] md:inline">
                        Read &rsaquo;
                      </span>
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
          {BRAND_NAME} &bull; daily editions &bull; cached every 2h by the newsroom cron
        </p>
      </footer>
    </section>
  );
}
