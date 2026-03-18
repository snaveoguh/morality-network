import Link from "next/link";
import { getAllArchivedItemsWithHashes } from "@/lib/archive";
import { BiasPill } from "@/components/feed/BiasBar";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncArchiveList() {
  const items = await withTimeout(getAllArchivedItemsWithHashes(), 15000, []);

  const sorted = [...items].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

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
    <>
      {/* Count in header context */}
      <p className="mb-6 -mt-2 font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
        {sorted.length} stories preserved from the feed. Every entity hash
        persists onchain &mdash; the source snapshots live here.
      </p>

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
                  <div className="flex w-24 shrink-0 flex-col gap-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {dateStr}
                    </span>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-light)]">
                      {item.source}
                    </span>
                    {item.bias && <BiasPill bias={item.bias} />}
                  </div>
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
    </>
  );
}
