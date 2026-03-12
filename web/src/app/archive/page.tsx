import Link from "next/link";
import { getAllArchivedItemsWithHashes } from "@/lib/archive";
import { BiasPill } from "@/components/feed/BiasBar";
import { BRAND_NAME, withBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export const metadata = {
  title: withBrand("Archive"),
  description:
    `Browse the ${BRAND_NAME} article archive — every story snapshot preserved onchain.`,
};

export default async function ArchivePage() {
  const items = await withTimeout(getAllArchivedItemsWithHashes(), 15000, []);

  // Sort by pubDate descending (newest first)
  const sorted = [...items].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  // Group by category
  const byCategory = new Map<string, typeof sorted>();
  for (const item of sorted) {
    const cat = item.category || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const categories = Array.from(byCategory.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  return (
    <section className="mx-auto max-w-4xl py-8">
      {/* Header */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <div className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <Link
            href="/"
            className="transition-colors hover:text-[var(--ink)]"
          >
            &larr; Front Page
          </Link>
          <span className="text-[var(--rule-light)]">|</span>
          <span>Archive</span>
        </div>
        <h1 className="font-headline text-3xl leading-tight text-[var(--ink)] md:text-4xl">
          The Archive
        </h1>
        <p className="mt-2 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          {sorted.length} stories preserved from the feed. Every entity hash
          persists onchain &mdash; the source snapshots live here.
        </p>
      </div>

      {/* Category sections */}
      {categories.map(([category, catItems]) => (
        <section key={category} className="mb-8">
          <div className="mb-3 flex items-center gap-2 border-b border-[var(--rule-light)] pb-2">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
              {category}
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              {catItems.length} {catItems.length === 1 ? "story" : "stories"}
            </span>
          </div>
          <div className="space-y-2">
            {catItems.map((item) => {
              const dateStr = new Date(item.pubDate).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              );
              return (
                <div
                  key={item.hash}
                  className="flex items-start gap-3 border-b border-[var(--rule-light)] pb-2 last:border-0 last:pb-0"
                >
                  {/* Date + source */}
                  <div className="flex w-24 shrink-0 flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {dateStr}
                    </span>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                      {item.source}
                    </span>
                    {item.bias && <BiasPill bias={item.bias} />}
                  </div>

                  {/* Title + description */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/article/${item.hash}`}
                      className="font-headline-serif text-sm font-bold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]"
                    >
                      {item.title}
                    </Link>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 font-body-serif text-xs text-[var(--ink-faint)]">
                        {item.description}
                      </p>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
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

                  {/* External link */}
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                  >
                    Source&nbsp;&rsaquo;
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Footer note */}
      <footer className="border-t border-[var(--rule-light)] pt-4 pb-8">
        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink-light)]">
            Archive Note
          </span>
          &nbsp;&mdash;&nbsp; Stories are archived automatically by the pooter
          world crawler as they cycle out of the live RSS feed window. Entity
          hashes are permanent &mdash; onchain ratings, tips, and discussion
          persist regardless of archive status.
        </p>
      </footer>
    </section>
  );
}
