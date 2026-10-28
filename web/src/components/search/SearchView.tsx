"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BiasRating } from "@/lib/bias";
import type { SearchGroup, SearchResponse } from "@/lib/search";
import { BIAS_OPTIONS, REGIONS, biasWords, timeAgo } from "@/lib/front";
import { SearchIcon } from "@/components/layout/icons";

export interface SearchItem {
  id: string;
  hash: string;
  title: string;
  description: string;
  source: string;
  bias: BiasRating | null;
  pubDate: string;
  category: string;
  tags: string[];
  countries: string[];
}

type FilterKey = "section" | "region" | "bias" | "source";
type Filters = Record<FilterKey, string>;

const FILTER_KEYS: FilterKey[] = ["section", "region", "bias", "source"];
const RESULT_PAGE = 30;

// ── One collapsed filter row: "Section ........ All ›" → options below ──────

function FilterRow({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? allLabel;
  return (
    <div className="border-b border-[var(--rule-light)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-between text-[15px] text-[var(--ink)]"
      >
        <span>{label}</span>
        <span className={value ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}>
          {current} <span aria-hidden>{open ? "⌃" : "›"}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 pb-4">
          {[{ value: "", label: allLabel }, ...options].map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`min-h-11 border px-3 text-sm transition-colors ${
                  active
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--rule)] text-[var(--ink)] hover:border-[var(--ink)]"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="news-label pb-2 text-xl text-[var(--ink)]">{children}</h2>;
}

export function SearchView({ items, trending }: { items: SearchItem[]; trending: string[] }) {
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [tag, setTag] = useState(() => (params.get("tag") ?? "").toLowerCase());
  const [filters, setFilters] = useState<Filters>(() => ({
    section: params.get("section") ?? "",
    region: params.get("region") ?? "",
    bias: params.get("bias") ?? "",
    source: params.get("source") ?? "",
  }));
  const [shown, setShown] = useState(RESULT_PAGE);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const deferredQuery = useDeferredValue(query);

  // Keep the URL shareable without adding history entries per keystroke.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (tag) next.set("tag", tag);
    for (const key of FILTER_KEYS) if (filters[key]) next.set(key, filters[key]);
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
  }, [query, tag, filters]);

  // Everything else on pooter world (archive, originals, video, governance…)
  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed.length < 2) {
      startTransition(() => setGroups([]));
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchResponse;
        startTransition(() =>
          setGroups((data.groups ?? []).filter((g) => g.section !== "breaking-news" && g.results.length > 0)),
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") startTransition(() => setGroups([]));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [deferredQuery]);

  const sections = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [items],
  );
  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => ({ value: s, label: s }));
  }, [items]);

  const results = useMemo(() => {
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const region = REGIONS.find((r) => r.value === filters.region);
    const bias = BIAS_OPTIONS.find((b) => b.value === filters.bias);
    return items.filter((i) => {
      if (tag && !i.tags.includes(tag)) return false;
      if (filters.section && i.category !== filters.section) return false;
      if (filters.source && i.source !== filters.source) return false;
      if (region && !i.countries.some((c) => region.iso.includes(c))) return false;
      if (bias && !(i.bias && bias.match.includes(i.bias))) return false;
      if (words.length) {
        const hay = `${i.title} ${i.description} ${i.source} ${i.tags.join(" ")}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [items, deferredQuery, tag, filters]);

  const filtering = Boolean(deferredQuery.trim() || tag || FILTER_KEYS.some((k) => filters[k]));
  const setFilter = (key: FilterKey) => (v: string) => {
    setShown(RESULT_PAGE);
    setFilters((f) => ({ ...f, [key]: v }));
  };
  const clearAll = () => {
    setQuery("");
    setTag("");
    setFilters({ section: "", region: "", bias: "", source: "" });
    setShown(RESULT_PAGE);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 pb-8 pt-3">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
        className="flex items-center gap-2.5"
      >
        <label className="flex h-12 flex-1 items-center gap-2.5 border-2 border-[var(--ink)] bg-[var(--paper-dark)] px-3">
          <SearchIcon className="h-5 w-5 shrink-0 text-[var(--ink)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setShown(RESULT_PAGE);
              setQuery(e.target.value);
            }}
            placeholder="Search stories, people, sources"
            aria-label="Search"
            autoFocus={!params.get("tag")}
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </label>
        {filtering && (
          <button type="button" onClick={clearAll} className="h-12 px-1 text-[15px] font-semibold text-[var(--ink)]">
            Clear
          </button>
        )}
      </form>

      {trending.length > 0 && (
        <section aria-label="Trending today">
          <SectionLabel>Trending today</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {trending.map((t) => {
              const active = t === tag;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setShown(RESULT_PAGE);
                    setTag(active ? "" : t);
                  }}
                  className={`min-h-11 border px-3 text-sm transition-colors ${
                    active
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-[var(--rule)] text-[var(--ink)] hover:border-[var(--ink)]"
                  }`}
                >
                  #{t.replace(/\s+/g, "")}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!filtering && (
        <section aria-label="Try searching">
          <SectionLabel>Try</SectionLabel>
          <div className="flex flex-col">
            <Link href="/ledger" className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--rule-light)] text-[15px] text-[var(--ink)]">
              <span>The Claim Ledger</span>
              <span className="text-[13px] text-[var(--ink-faint)]">claims from PMQs ›</span>
            </Link>
            <Link href="/signals" className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--rule-light)] text-[15px] text-[var(--ink)]">
              <span>Bearometer</span>
              <span className="text-[13px] text-[var(--ink-faint)]">buy, hold or sell ›</span>
            </Link>
            {sources.slice(0, 3).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setFilter("source")(s.value)}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--rule-light)] text-left text-[15px] text-[var(--ink)]"
              >
                <span>{s.label}</span>
                <span className="text-[13px] text-[var(--ink-faint)]">source ›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Filters">
        <SectionLabel>Filters</SectionLabel>
        <FilterRow label="Section" value={filters.section} options={sections} onChange={setFilter("section")} />
        <FilterRow label="Region" value={filters.region} options={REGIONS} onChange={setFilter("region")} />
        <FilterRow label="Bias" value={filters.bias} options={BIAS_OPTIONS} onChange={setFilter("bias")} />
        <FilterRow
          label="Source"
          value={filters.source}
          options={sources}
          onChange={setFilter("source")}
          allLabel={`${sources.length} sources`}
        />
      </section>

      <section aria-label="Results" aria-live="polite">
        <SectionLabel>{filtering ? `${results.length} in today’s feed` : "Today’s feed"}</SectionLabel>
        {results.length === 0 ? (
          <p className="py-4 text-[15px] text-[var(--ink-light)]">
            Nothing in today&rsquo;s feed matches.{" "}
            <button type="button" onClick={clearAll} className="underline underline-offset-4">
              Clear search and filters
            </button>
          </p>
        ) : (
          <div className="flex flex-col">
            {results.slice(0, shown).map((i) => (
              <Link
                key={i.id}
                href={`/article/${i.hash}`}
                className="group flex flex-col gap-1.5 border-b border-[var(--rule-light)] py-3.5"
              >
                <span className="text-xs text-[var(--ink-faint)]">
                  {[i.source, biasWords(i.bias), timeAgo(i.pubDate)].filter(Boolean).join(" · ")}
                </span>
                <span className="news-head text-xl leading-[1.22] text-[var(--ink)] group-hover:underline group-hover:decoration-[var(--ink-faint)] group-hover:decoration-1 group-hover:underline-offset-4">
                  {i.title}
                </span>
              </Link>
            ))}
          </div>
        )}
        {results.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + RESULT_PAGE)}
            className="mt-4 flex min-h-12 w-full items-center justify-center border border-[var(--rule)] text-sm font-semibold text-[var(--ink)] hover:bg-[var(--paper-dark)]"
          >
            Show more ({results.length - shown} left)
          </button>
        )}
      </section>

      {(groups.length > 0 || searching) && (
        <section aria-label="Across pooter world">
          <SectionLabel>Across pooter world</SectionLabel>
          {searching && groups.length === 0 && <p className="text-sm text-[var(--ink-faint)]">Searching…</p>}
          {groups.map((g) => (
            <div key={g.section} className="pb-3">
              <h3 className="pt-2 text-[13px] font-bold text-[var(--ink-light)]">
                {g.label} &middot; {g.count}
              </h3>
              {g.results.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  target={r.external ? "_blank" : undefined}
                  rel={r.external ? "noopener noreferrer" : undefined}
                  className="group flex flex-col gap-1 border-b border-[var(--rule-light)] py-3"
                >
                  <span className="text-xs text-[var(--ink-faint)]">
                    {[r.source, timeAgo(r.pubDate)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="news-head text-lg leading-[1.25] text-[var(--ink)] group-hover:underline group-hover:underline-offset-4">
                    {r.title}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
