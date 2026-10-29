import Link from "next/link";
import type { FeedItem } from "@/lib/rss";
import type { Cast } from "@/lib/farcaster";
import type { PooterOriginal } from "@/lib/editorial-archive";
import { computeEntityHash } from "@/lib/entity";
import { biasBucket, biasWords, tagLabel, timeAgo, topTags } from "@/lib/front";

// ============================================================================
// FRONT FEED — the direction C front page body (server component)
//
// Every block here is a direct child of <FrontGrid> (the wrappers use
// `display: contents`), so the page can interleave them with the lead story
// and the ledger rail, which stream in through their own Suspense
// boundaries:
//
//   phone (flex column, by `order`)      ≥1024 (12-col grid)
//   0 Trending row                       row 1  Trending ─────────── 12
//   1 Lead story        (AsyncMasthead)  row 2  Lead ──────── 9 │ Ledger 3
//   2 Two secondary stories              row 3  Secondaries ─ 9 │ rail
//   3 Claim Ledger cards (LedgerStrip)   then   ═══ double rule ═══
//   4 Bearometer card                           Data: text 4 │ chart 8
//   5 Feed-mix chart                            Bearometer   │ Latest 8
//   6 Latest list                               Conversation │
//   7 Pooter originals (sideways cards)         Originals ─────────── 12
//   8 Conversation (Farcaster)
// ============================================================================

const LATEST_COUNT = 30;

export function FrontGrid({ children }: { children: React.ReactNode }) {
  // Row 3 is 1fr so the ledger rail (rows 2-3) grows the secondaries row,
  // never the lead row.
  return <div className="flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">{children}</div>;
}

function sourceLine(item: FeedItem): string {
  return [item.source, biasWords(item.bias?.bias), timeAgo(item.pubDate)]
    .filter(Boolean)
    .join(" · ");
}

function articleHref(item: FeedItem): string {
  return `/article/${computeEntityHash(item.link)}`;
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
      <Link
        href="/signals"
        className="flex h-11 min-w-11 items-center justify-center text-[var(--ink-light)] hover:text-[var(--ink)] hover:underline hover:underline-offset-4"
      >
        Bearometer
      </Link>
    </nav>
  );
}

// ── Secondary stories ───────────────────────────────────────────────────────

function SecondaryStory({ item, wide }: { item: FeedItem; wide: boolean }) {
  return (
    <Link
      href={articleHref(item)}
      className={`group flex gap-3.5 border-b border-[var(--rule-light)] py-4 lg:flex-col lg:gap-1.5 lg:border-b-0 lg:border-t lg:pt-3.5 ${
        wide ? "lg:col-span-5" : "lg:col-span-4 lg:pr-6"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs text-[var(--ink-faint)] lg:order-first">{sourceLine(item)}</span>
        <span className="news-head order-first text-[21px] leading-[1.2] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4 lg:order-none lg:text-[21px]">
          {item.title}
        </span>
      </span>
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="newspaper-img halftone h-24 w-24 shrink-0 object-cover lg:order-first lg:mb-2 lg:aspect-[3/2] lg:h-auto lg:w-full"
        />
      )}
    </Link>
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
      className="order-5 mt-6 flex flex-col gap-3 border border-[var(--rule-light)] bg-[#f2ede2] p-4 text-[#0d0d0d] lg:order-[11] lg:col-span-12 lg:mt-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0 lg:text-[var(--ink)]"
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

// ── Bearometer card ─────────────────────────────────────────────────────────

function BearometerCard() {
  return (
    <Link
      href="/signals"
      className="group order-4 mt-5 flex flex-col gap-1.5 border border-[var(--rule)] p-4 lg:order-[12] lg:col-span-4 lg:mt-7 lg:self-start"
    >
      <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink)] lg:text-sm">
        <span aria-hidden className="h-2.5 w-2.5 bg-[var(--ink)]" />
        Bearometer ›
      </span>
      <span className="news-head text-[21px] leading-[1.2] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4 lg:text-xl">
        Buy, hold or sell: today&rsquo;s market signals, read from the news we crawl
      </span>
    </Link>
  );
}

// ── Latest ──────────────────────────────────────────────────────────────────

function LatestList({ items, total }: { items: FeedItem[]; total: number }) {
  return (
    <section aria-label="Latest" className="order-6 flex flex-col pt-[22px] lg:order-[13] lg:col-span-8 lg:pt-7">
      <Link href="/search" className="pb-1 text-[15px] font-bold text-[var(--ink)]">
        Latest ›
      </Link>
      <div className="grid md:grid-cols-2 md:gap-x-6">
        {items.map((item) => (
          <Link
            key={item.id}
            href={articleHref(item)}
            className="group flex gap-3.5 border-b border-[var(--rule-light)] py-3.5"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-xs text-[var(--ink-faint)]">{sourceLine(item)}</span>
              <span className="news-head text-xl leading-[1.22] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4">
                {item.title}
              </span>
            </span>
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                className="newspaper-img halftone h-[72px] w-[72px] shrink-0 object-cover"
              />
            )}
          </Link>
        ))}
      </div>
      <Link
        href="/search"
        className="mt-4 flex min-h-12 items-center justify-center border border-[var(--rule)] text-sm font-semibold text-[var(--ink)] hover:bg-[var(--paper-dark)]"
      >
        Search and filter all {total} stories ›
      </Link>
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

// ── Conversation (Farcaster) ────────────────────────────────────────────────

function Conversation({ casts }: { casts: Cast[] }) {
  return (
    <section aria-label="Conversation" className="order-[8] flex flex-col pt-7">
      <Link href="/discuss" className="pb-1 text-[15px] font-bold text-[var(--ink)]">
        Conversation ›
      </Link>
      {casts.map((c) => (
        <a
          key={c.hash}
          href={`https://warpcast.com/${c.author.username}/${c.hash.slice(0, 10)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col gap-1.5 border-b border-[var(--rule-light)] py-3.5"
        >
          <span className="text-xs text-[var(--ink-faint)]">
            {[`@${c.author.username}`, timeAgo(c.timestamp), c.replies ? `${c.replies} ${c.replies === 1 ? "reply" : "replies"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="line-clamp-4 text-[15px] leading-normal text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:underline-offset-4">
            {c.text}
          </span>
        </a>
      ))}
    </section>
  );
}

// ── Composition ─────────────────────────────────────────────────────────────

export function FrontFeed({
  rssItems,
  publishedHashes,
  originals = [],
  casts = [],
}: {
  rssItems: FeedItem[];
  publishedHashes: Set<string>;
  originals?: PooterOriginal[];
  casts?: Cast[];
}) {
  // Secondaries: today's newsroom picks first, then the freshest story with
  // an image, then simply the freshest.
  const withHash = rssItems.map((item) => ({ item, hash: computeEntityHash(item.link) }));
  const picks: FeedItem[] = [];
  const take = (pred: (x: (typeof withHash)[number]) => boolean) => {
    for (const x of withHash) {
      if (picks.length >= 2) return;
      if (!picks.includes(x.item) && pred(x)) picks.push(x.item);
    }
  };
  take((x) => publishedHashes.has(x.hash) && Boolean(x.item.imageUrl));
  take((x) => publishedHashes.has(x.hash));
  take((x) => Boolean(x.item.imageUrl) && !x.item.datedAtFetch);
  take(() => true);

  const latest = rssItems.filter((item) => !picks.includes(item)).slice(0, LATEST_COUNT);
  const tags = topTags(rssItems.slice(0, 200), 6);

  return (
    <>
      {tags.length > 0 && <TrendingRow tags={tags} />}

      {picks.length > 0 && (
        <div className="order-2 mt-5 border-t border-[var(--rule-light)] lg:col-span-9 lg:row-start-3 lg:mt-0 lg:grid lg:grid-cols-9 lg:gap-x-6 lg:border-t-0 lg:pt-6">
          {picks.map((item, i) => (
            <SecondaryStory key={item.id} item={item} wide={i === 1} />
          ))}
        </div>
      )}

      <hr className="rule-double hidden lg:order-[10] lg:col-span-12 lg:mt-8 lg:block" />
      <FeedMixChart items={rssItems} />
      {/* Left column at ≥1024 (Bearometer over Conversation, beside Latest);
          on phone the wrapper vanishes and each block takes its own order. */}
      <div className="contents lg:order-[12] lg:col-span-4 lg:flex lg:flex-col lg:self-start">
        <BearometerCard />
        {casts.length > 0 && <Conversation casts={casts.slice(0, 5)} />}
      </div>
      {latest.length > 0 && <LatestList items={latest} total={rssItems.length} />}
      {originals.length > 0 && <OriginalsRow originals={originals.slice(0, 8)} />}
    </>
  );
}
