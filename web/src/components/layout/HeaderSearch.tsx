"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloseIcon, SearchIcon } from "@/components/layout/icons";
import { timeAgo } from "@/lib/front";
import type { SearchGroup, SearchResponse, SearchResult } from "@/lib/search";

// ============================================================================
// HEADER SEARCH — desktop (>=1024px) search box with a live dropdown.
//
// Still a plain <form action="/search"> so it works without JS. With JS, typing
// two or more characters fetches /api/search (debounced) and shows the top
// results grouped by section, with a "See all results" row that opens the
// full /search page for the same query.
// ============================================================================

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const MAX_RESULTS = 8;

interface Section {
  label: string;
  results: SearchResult[];
}

const MAX_PER_SOURCE = 2;

/** Take the top results across groups (in API order), keeping section labels.
 *  At most two per outlet, so one source can't fill the panel. */
function pickTop(groups: SearchGroup[], limit: number): Section[] {
  const out: Section[] = [];
  const perSource = new Map<string, number>();
  let left = limit;
  for (const group of groups) {
    if (left <= 0) break;
    const take: SearchResult[] = [];
    for (const result of group.results) {
      if (take.length >= left) break;
      const key = (result.source ?? "").toLowerCase();
      const seen = perSource.get(key) ?? 0;
      if (key && seen >= MAX_PER_SOURCE) continue;
      perSource.set(key, seen + 1);
      take.push(result);
    }
    if (take.length === 0) continue;
    out.push({ label: group.label, results: take });
    left -= take.length;
  }
  return out;
}

function meta(result: SearchResult): string {
  return [result.source, timeAgo(result.pubDate)].filter(Boolean).join(" · ");
}

export function HeaderSearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [settledQuery, setSettledQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const longEnough = trimmed.length >= MIN_CHARS;

  // Debounced fetch of /api/search.
  useEffect(() => {
    if (trimmed.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as SearchResponse;
        setGroups(Array.isArray(data.groups) ? data.groups : []);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setGroups([]);
      }
      setSettledQuery(trimmed);
      setActive(-1);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const sections = useMemo(() => pickTop(groups, MAX_RESULTS), [groups]);
  const flat = useMemo(() => sections.flatMap((s) => s.results), [sections]);
  const seeAllHref = `/search?q=${encodeURIComponent(trimmed)}`;
  // Rows are the results plus the "See all" row at the end.
  const rowCount = flat.length + 1;
  const fresh = settledQuery === trimmed;
  const showPanel = open && longEnough;

  const go = (href: string, external?: boolean) => {
    setOpen(false);
    if (external) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  };

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else {
        inputRef.current?.blur();
      }
      return;
    }
    if (!longEnough) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % rowCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? rowCount - 1 : i - 1));
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      const hit = flat[active];
      if (hit) go(hit.href, hit.external);
      else go(seeAllHref);
    }
    // Enter with nothing highlighted falls through to the form submit.
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) {
      go("/search");
      return;
    }
    go(seeAllHref);
  }

  const rowId = (i: number) => `${listId}-row-${i}`;
  let index = -1;

  return (
    <div ref={wrapRef} className="relative w-[220px]">
      <form action="/search" method="get" role="search" onSubmit={onSubmit}>
        <label className="flex h-11 items-center gap-2 border border-[var(--rule)] px-3">
          <SearchIcon className="h-4 w-4 shrink-0 text-[var(--ink)]" />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search"
            aria-label="Search"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && active >= 0 ? rowId(active) : undefined}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setActive(-1);
                inputRef.current?.focus();
              }}
              className="shrink-0 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </label>
      </form>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[420px] max-w-[calc(100vw-32px)] border border-[var(--rule)] bg-[var(--paper)] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {!fresh || (loading && flat.length === 0) ? (
            <p className="px-4 py-3 text-[13px] text-[var(--ink-faint)]">Searching…</p>
          ) : flat.length === 0 ? (
            <p className="px-4 py-3 text-[14px] text-[var(--ink-light)]">
              No results for “{trimmed}”
            </p>
          ) : (
            <div className="max-h-[min(70vh,560px)] overflow-y-auto py-1">
              {sections.map((section) => (
                <div key={section.label} role="group" aria-label={section.label}>
                  {sections.length > 1 && (
                    <p className="px-4 pb-1 pt-2.5 text-[12px] text-[var(--ink-faint)]">{section.label}</p>
                  )}
                  {section.results.map((result) => {
                    index += 1;
                    const i = index;
                    const selected = i === active;
                    return (
                      <Link
                        key={result.id}
                        id={rowId(i)}
                        role="option"
                        aria-selected={selected}
                        href={result.href}
                        target={result.external ? "_blank" : undefined}
                        rel={result.external ? "noopener noreferrer" : undefined}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => setOpen(false)}
                        className={`block px-4 py-2 ${selected ? "bg-[var(--paper-dark)]" : ""}`}
                      >
                        <span className="news-head line-clamp-2 block text-[16px] leading-snug text-[var(--ink)]">
                          {result.title}
                        </span>
                        {meta(result) && (
                          <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-faint)]">
                            {meta(result)}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <Link
            id={rowId(flat.length)}
            role="option"
            aria-selected={active === flat.length}
            href={seeAllHref}
            onMouseEnter={() => setActive(flat.length)}
            onClick={() => setOpen(false)}
            className={`block truncate border-t border-[var(--rule-light)] px-4 py-3 text-[14px] font-semibold text-[var(--ink)] ${
              active === flat.length ? "bg-[var(--paper-dark)]" : ""
            }`}
          >
            See all results for “{trimmed}” ›
          </Link>
        </div>
      )}
    </div>
  );
}
