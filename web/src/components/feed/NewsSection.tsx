"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { tagLabel } from "@/lib/front";

// ============================================================================
// NEWS — the day's stories under one row of tabs (Latest, World, Politics,
// Business & markets, Tech & science, Environment, Sport). Two lead cards
// with photos, then a list with thumbnails. Items arrive pre-formatted from
// the server (FrontFeed) so nothing date-dependent renders on the client.
//
// The Trending row lives here too: a tag filters these stories in place
// (and sets ?tag= so the view can be shared) instead of leaving for /search.
// ============================================================================

export interface NewsItem {
  id: string;
  href: string;
  title: string;
  meta: string;
  imageUrl?: string;
  category: string;
  /** Lower-cased auto-tags. */
  tags: string[];
}

export interface NewsTab {
  value: string;
  label: string;
  /** Feed categories in this tab; empty = everything (Latest). */
  categories: string[];
}

const PAGE = 20;

function FeaturedCard({ item }: { item: NewsItem }) {
  return (
    <Link href={item.href} className="group flex flex-col gap-1.5 border-b border-[var(--rule-light)] py-4 md:border-b-0 md:pt-0">
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="newspaper-img halftone mb-1.5 aspect-[3/2] w-full object-cover" />
      )}
      <span className="text-xs text-[var(--ink-faint)]">{item.meta}</span>
      <span className="news-head text-[21px] leading-[1.2] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4">
        {item.title}
      </span>
    </Link>
  );
}

function ListRow({ item }: { item: NewsItem }) {
  return (
    <Link href={item.href} className="group flex gap-3.5 border-b border-[var(--rule-light)] py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs text-[var(--ink-faint)]">{item.meta}</span>
        <span className="news-head text-xl leading-[1.22] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4">
          {item.title}
        </span>
      </span>
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="newspaper-img halftone h-[72px] w-[72px] shrink-0 object-cover" />
      )}
    </Link>
  );
}

const noSubscribe = () => () => {};
const readUrlTag = () => new URLSearchParams(window.location.search).get("tag")?.toLowerCase() ?? "";

function TrendingRow({ tags, active, onPick }: { tags: string[]; active: string; onPick: (tag: string) => void }) {
  return (
    <nav
      aria-label="Trending"
      className="order-0 -mx-4 flex h-11 items-center gap-[18px] overflow-x-auto whitespace-nowrap border-y border-[var(--rule-light)] px-4 text-sm scrollbar-hide lg:col-span-12 lg:row-start-1 lg:mx-0 lg:h-12 lg:justify-center lg:gap-6 lg:text-[15px]"
    >
      <span className="font-bold text-[var(--ink)]">Trending</span>
      {tags.map((tag) => {
        const on = tag === active;
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? "" : tag)}
            className={`flex h-11 min-w-11 items-center justify-center ${
              on
                ? "font-bold text-[var(--ink)] underline decoration-2 underline-offset-4"
                : "text-[var(--ink-light)] hover:text-[var(--ink)] hover:underline hover:underline-offset-4"
            }`}
          >
            {tagLabel(tag)}
          </button>
        );
      })}
    </nav>
  );
}

export function NewsSection({
  items,
  tabs,
  trending,
  total,
}: {
  items: NewsItem[];
  tabs: NewsTab[];
  trending: string[];
  total: number;
}) {
  const [tab, setTab] = useState(tabs[0]?.value ?? "latest");
  // null until a tag is picked here; until then ?tag= from the URL applies.
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const sectionRef = useRef<HTMLElement>(null);

  // The page is statically cached, so ?tag= is read on the client only
  // (the server snapshot is "", and React re-renders after hydration).
  const urlTag = useSyncExternalStore(noSubscribe, readUrlTag, () => "");
  const tag = picked ?? (trending.includes(urlTag) ? urlTag : "");

  const pickTag = (next: string) => {
    setPicked(next);
    setShown(PAGE);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("tag", next);
    else url.searchParams.delete("tag");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (next) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const current = tabs.find((t) => t.value === tab) ?? tabs[0];
  const filtered = tag
    ? items.filter((i) => i.tags.includes(tag))
    : current && current.categories.length > 0
      ? items.filter((i) => current.categories.includes(i.category))
      : items;

  // Two photo-led cards up top: the first two stories that have a photo.
  const featured = filtered.filter((i) => i.imageUrl).slice(0, 2);
  const rest = filtered.filter((i) => !featured.includes(i));
  const moreLabel = tag ? tagLabel(tag) : current?.value === "latest" ? "stories" : current?.label;

  return (
    <>
      {trending.length > 0 && <TrendingRow tags={trending} active={tag} onPick={pickTag} />}
      {items.length > 0 && (
        <section
          ref={sectionRef}
          aria-label="News"
          className="order-5 flex scroll-mt-20 flex-col pt-7 lg:order-[13] lg:col-span-8 lg:border-l lg:border-[var(--rule-light)] lg:pl-6"
        >
          {tag ? (
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--rule-light)] pb-2">
              <h2 className="news-head text-xl text-[var(--ink)]">
                {tagLabel(tag)} <span className="text-[15px] text-[var(--ink-faint)]">· {filtered.length} {filtered.length === 1 ? "story" : "stories"}</span>
              </h2>
              <button
                type="button"
                onClick={() => pickTag("")}
                className="flex min-h-11 items-center px-1 text-[15px] font-semibold text-[var(--ink)] hover:underline hover:underline-offset-4"
              >
                Show all ×
              </button>
            </div>
          ) : (
            <div
              role="tablist"
              aria-label="News sections"
              className="scrollbar-hide -mx-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-[var(--rule-light)] px-4 lg:mx-0 lg:px-0"
            >
              {tabs.map((t) => {
                const active = t.value === tab;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setTab(t.value);
                      setShown(PAGE);
                    }}
                    className={`-mb-px flex min-h-11 items-center border-b-2 px-2.5 text-[15px] transition-colors ${
                      active
                        ? "border-[var(--ink)] font-bold text-[var(--ink)]"
                        : "border-transparent text-[var(--ink-light)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {featured.length > 0 && (
            <div className="grid gap-x-6 pt-4 md:grid-cols-2 md:border-b md:border-[var(--rule-light)] md:pb-5">
              {featured.map((item) => (
                <FeaturedCard key={item.id} item={item} />
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 md:gap-x-6">
            {rest.slice(0, shown).map((item) => (
              <ListRow key={item.id} item={item} />
            ))}
          </div>

          {rest.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-4 flex min-h-12 items-center justify-center border border-[var(--rule)] text-sm font-semibold text-[var(--ink)] hover:bg-[var(--paper-dark)]"
            >
              More {moreLabel} ({rest.length - shown} left)
            </button>
          ) : (
              <Link
                href="/search"
                className="mt-4 flex min-h-12 items-center justify-center border border-[var(--rule)] text-sm font-semibold text-[var(--ink)] hover:bg-[var(--paper-dark)]"
              >
                Search and filter all {total} stories ›
              </Link>
          )}
        </section>
      )}
    </>
  );
}
