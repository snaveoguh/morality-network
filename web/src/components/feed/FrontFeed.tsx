import Link from "next/link";
import type { FeedItem } from "@/lib/rss";
import type { PooterOriginal } from "@/lib/editorial-archive";
import { computeEntityHash } from "@/lib/entity";
import { biasBucket, biasWords, tagLabel, timeAgo, topTags } from "@/lib/front";
import { NewsSection, type NewsItem, type NewsTab } from "./NewsSection";

// ============================================================================
// FRONT FEED — the direction C front page body (server component)
//
// Signals and charts lead; the day's news sits below them behind section
// tabs. Every block is a direct child of <FrontGrid> so the page can
// interleave blocks that stream in through their own Suspense boundaries
// (lead, Bearometer signals, ledger, commentary):
//
//   phone (flex column, by `order`)      ≥1024 (12-col grid)
//   0 Trending row                       row 1  Trending ─────────── 12
//   1 Lead story        (AsyncMasthead)  row 2  Lead ──────── 9 │ Ledger 3
//   2 Bearometer signals (AsyncSignals)  row 3  Signals ───── 9 │ rail
//   3 Claim Ledger cards (LedgerStrip)   then   ═══ double rule ═══
//   4 Feed-mix chart                            Data: text 4 │ chart 8
//   5 News, tabbed (NewsSection)                Commentary 4 │ News 8
//   6 pooter1 + Conversation (AsyncCommentary)  Originals ─────────── 12
//   7 Pooter originals (sideways cards)
// ============================================================================

const NEWS_PER_TAB = 60;

const TABS: NewsTab[] = [
  { value: "latest", label: "Latest", categories: [] },
  { value: "world", label: "World", categories: ["World"] },
  { value: "politics", label: "Politics", categories: ["Politics", "Governance"] },
  { value: "markets", label: "Business & markets", categories: ["Business", "Crypto"] },
  { value: "tech", label: "Tech & science", categories: ["Tech", "Science"] },
  { value: "environment", label: "Environment", categories: ["Environment"] },
  { value: "sport", label: "Sport", categories: ["Sport"] },
];

export function FrontGrid({ children }: { children: React.ReactNode }) {
  // Row 3 is 1fr so the ledger rail (rows 2-3) grows the signals row,
  // never the lead row.
  return <div className="flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">{children}</div>;
}

function sourceLine(item: FeedItem): string {
  return [item.source, biasWords(item.bias?.bias), timeAgo(item.pubDate)]
    .filter(Boolean)
    .join(" · ");
}

// ── Trending ────────────────────────────────────────────────────────────────

export function TrendingRow({ tags }: { tags: string[] }) {
  return (
    <nav
      aria-label="Trending"
      className="order-0 -mx-4 flex h-11 items-center gap-[18px] overflow-x-auto whitespace-nowrap border-y border-[var(--rule-light)] px-4 text-sm scrollbar-hide lg:col-span-12 lg:row-start-1 lg:mx-0 lg:h-12 lg:justify-center lg:gap-6 lg:text-[15px]"
    >
      <span className="font-bold text-[var(--ink)]">Trending</span>
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/search?tag=${encodeURIComponent(tag)}`}
          className="flex h-11 min-w-11 items-center justify-center text-[var(--ink-light)] hover:text-[var(--ink)] hover:underline hover:underline-offset-4"
        >
          {tagLabel(tag)}
        </Link>
      ))}
    </nav>
  );
}

// ── Feed-mix chart (cream panel, one ink colour) ────────────────────────────

function FeedMixChart({ items }: { items: FeedItem[] }) {
  const seen = new Set<string>();
  const counts = { Left: 0, Centre: 0, Right: 0 };
  for (const item of items) {
    const bias = item.bias;
    if (!bias || seen.has(bias.domain)) continue;
    seen.add(bias.domain);
    counts[biasBucket(bias.bias)] += 1;
  }
  const total = counts.Left + counts.Centre + counts.Right;
  if (total === 0) return null;
  const rows = (Object.keys(counts) as Array<keyof typeof counts>).map((label) => ({
    label,
    pct: Math.round((counts[label] / total) * 100),
  }));
  const max = Math.max(...rows.map((r) => r.pct));
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <section
      aria-label="Where today’s feed comes from"
      className="order-4 mt-6 flex flex-col gap-3 border border-[var(--rule-light)] bg-[#f2ede2] p-4 text-[#0d0d0d] lg:order-[11] lg:col-span-12 lg:mt-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0 lg:text-[var(--ink)]"
    >
      <div className="flex flex-col gap-3 lg:col-span-4">
        <span className="hidden text-[15px] font-bold lg:block">Data ›</span>
        <h2 className="news-label text-xl leading-tight lg:news-head lg:text-[28px] lg:leading-[1.12]">
          Where today&rsquo;s feed comes from
        </h2>
        <p className="text-[13px] text-[#383734] lg:text-[15px] lg:leading-normal lg:text-[var(--ink-light)]">
          Share of the {total} sources in today&rsquo;s feed, by rated bias. Every chart on pooter world is drawn
          from data we collect ourselves.
        </p>
      </div>
      <div className="flex flex-col gap-3 lg:col-span-8 lg:bg-[#f2ede2] lg:px-6 lg:py-5 lg:text-[#0d0d0d]">
        <span className="hidden text-lg lg:block">Today&rsquo;s feed by rated source bias, {total} sources</span>
        <div className="flex flex-col gap-2 text-[13px] lg:text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[56px_1fr_40px] items-center gap-2">
              <span>{r.label}</span>
              <span className="h-[18px] bg-[#0d0d0d] lg:h-6" style={{ width: `${max ? (r.pct / max) * 100 : 0}%` }} />
              <span className="text-right font-bold">{r.pct}%</span>
            </div>
          ))}
        </div>
        <span className="text-[11px] text-[#6e6a61] lg:text-xs">
          Source: pooter.world feed crawl, {dateStr} &middot; updates live
        </span>
      </div>
    </section>
  );
}

// ── Pooter originals (sideways cards, like the ledger) ──────────────────────

function OriginalsRow({ originals }: { originals: PooterOriginal[] }) {
  return (
    <section aria-label="Pooter originals" className="order-[7] -mx-4 pt-7 lg:order-[14] lg:col-span-12 lg:mx-0">
      <Link href="/originals" className="px-4 pb-3 text-[15px] font-bold text-[var(--ink)] lg:px-0">
        Pooter originals ›
      </Link>
      <div className="scrollbar-hide mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {originals.map((o) => (
          <Link
            key={o.hash}
            href={`/article/${o.hash}`}
            className="group flex w-[240px] shrink-0 snap-start flex-col gap-2 lg:w-auto"
          >
            {o.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.imageUrl} alt="" loading="lazy" className="newspaper-img halftone aspect-[3/2] w-full object-cover" />
            ) : (
              <span aria-hidden className="halftone aspect-[3/2] w-full" />
            )}
            <span className="text-xs text-[var(--ink-faint)]">
              {[o.source, timeAgo(o.generatedAt)].filter(Boolean).join(" · ")}
            </span>
            <span className="news-head line-clamp-3 text-lg leading-[1.22] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4">
              {o.title}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Composition ─────────────────────────────────────────────────────────────

/** Newest stories per tab, newsroom picks first in Latest, as plain data. */
function newsItems(rssItems: FeedItem[], publishedHashes: Set<string>): NewsItem[] {
  const toNews = (item: FeedItem): NewsItem => ({
    id: item.id,
    href: `/article/${computeEntityHash(item.link)}`,
    title: item.title,
    meta: sourceLine(item),
    imageUrl: item.imageUrl || undefined,
    category: item.category,
  });
  const picked = rssItems.filter((i) => publishedHashes.has(computeEntityHash(i.link)));
  const ordered = [...picked, ...rssItems.filter((i) => !picked.includes(i))];
  // Keep the payload small: at most NEWS_PER_TAB per category, plus the
  // newest NEWS_PER_TAB overall for Latest.
  const perCategory = new Map<string, number>();
  const keep = new Set<FeedItem>(ordered.slice(0, NEWS_PER_TAB));
  for (const item of ordered) {
    const n = perCategory.get(item.category) ?? 0;
    if (n < NEWS_PER_TAB) {
      keep.add(item);
      perCategory.set(item.category, n + 1);
    }
  }
  return ordered.filter((i) => keep.has(i)).map(toNews);
}

export function FrontFeed({
  rssItems,
  publishedHashes,
  originals = [],
}: {
  rssItems: FeedItem[];
  publishedHashes: Set<string>;
  originals?: PooterOriginal[];
}) {
  const tags = topTags(rssItems.slice(0, 200), 6);
  const news = newsItems(rssItems, publishedHashes);
  // Only offer tabs that have something in them today.
  const tabs = TABS.filter(
    (t) => t.categories.length === 0 || news.filter((n) => t.categories.includes(n.category)).length >= 3,
  );

  return (
    <>
      {tags.length > 0 && <TrendingRow tags={tags} />}
      <hr className="rule-double hidden lg:order-[10] lg:col-span-12 lg:mt-8 lg:block" />
      <FeedMixChart items={rssItems} />
      {news.length > 0 && <NewsSection items={news} tabs={tabs} total={rssItems.length} />}
      {originals.length > 0 && <OriginalsRow originals={originals.slice(0, 8)} />}
    </>
  );
}
