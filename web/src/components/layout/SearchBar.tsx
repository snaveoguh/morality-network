"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { SearchGroup, SearchResponse, SearchResult, SearchSection } from "@/lib/search";

const SECTION_STYLES: Record<
  SearchSection,
  { border: string; chipBg: string; chipText: string }
> = {
  "breaking-news": {
    border: "#1A1A1A",
    chipBg: "#1A1A1A",
    chipText: "#F5F0E8",
  },
  "pooter-og": {
    border: "#4E4030",
    chipBg: "#4E4030",
    chipText: "#F5F0E8",
  },
  videos: {
    border: "#8C2F1C",
    chipBg: "#8C2F1C",
    chipText: "#F5F0E8",
  },
  music: {
    border: "#224A5B",
    chipBg: "#224A5B",
    chipText: "#F5F0E8",
  },
  governance: {
    border: "#5E5A2E",
    chipBg: "#5E5A2E",
    chipText: "#F5F0E8",
  },
};

function formatRelativeTime(pubDate?: string): string | null {
  if (!pubDate) return null;
  const ts = new Date(pubDate).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = Date.now() - ts;
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(pubDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getDropdownPosition(input: HTMLInputElement | null) {
  if (!input || typeof window === "undefined") {
    return { top: 0, left: 0, width: 360 };
  }

  const rect = input.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const maxWidth = Math.min(640, viewportWidth - 24);
  const width = Math.max(380, Math.min(maxWidth, Math.max(rect.width + 180, 480)));
  const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));

  return {
    top: rect.bottom + 8,
    left,
    width,
  };
}

function buildMeta(result: SearchResult): string {
  return [result.source, result.category, formatRelativeTime(result.pubDate)]
    .filter(Boolean)
    .join(" · ");
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed.length < 2) {
      setLoading(false);
      setHasSearched(false);
      setGroups([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as SearchResponse;
        startTransition(() => {
          setGroups(Array.isArray(data.groups) ? data.groups : []);
          setHasSearched(true);
          setIsOpen(true);
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        startTransition(() => {
          setGroups([]);
          setHasSearched(true);
          setIsOpen(true);
        });
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [deferredQuery]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropRef.current &&
        !dropRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const totalResults = groups.reduce((sum, group) => sum + group.results.length, 0);
  const showDropdown =
    mounted &&
    isOpen &&
    (loading || totalResults > 0 || (hasSearched && query.trim().length >= 2));

  return (
    <>
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Search
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder="news, OG, video, music"
          className="h-7 w-40 border-2 border-[var(--rule)] bg-[var(--paper)] pl-14 pr-7 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] transition-[width,border-color,box-shadow] duration-150 focus:w-[24rem] focus:border-[var(--ink)] focus:outline-none focus:shadow-[4px_4px_0_rgba(26,26,26,0.08)]"
          aria-label="Search across breaking news, pooter originals, videos, music, and governance"
        />
        {loading && (
          <span className="absolute right-2 h-2.5 w-2.5 animate-spin rounded-full border border-[var(--ink)] border-t-transparent" />
        )}
      </div>

      {showDropdown &&
        createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 99996 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={dropRef}
              style={{
                position: "fixed",
                ...getDropdownPosition(inputRef.current),
                zIndex: 99997,
                maxHeight: "min(78vh, 760px)",
                overflowY: "auto",
                backgroundColor: "#F5F0E8",
                border: "2px solid #1A1A1A",
                boxShadow: "8px 8px 0 rgba(26, 26, 26, 0.12)",
              }}
            >
              <div
                style={{
                  padding: "10px 12px 8px",
                  borderBottom: "2px solid #1A1A1A",
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.035) 0%, rgba(0,0,0,0) 100%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.18em",
                        color: "#6B665E",
                        marginBottom: 4,
                      }}
                    >
                      Search The Wire
                    </div>
                    <div
                      style={{
                        fontFamily: "serif",
                        fontSize: "18px",
                        lineHeight: 1.1,
                        color: "#1A1A1A",
                      }}
                    >
                      {query.trim().length >= 2
                        ? loading
                          ? `Searching “${query.trim()}”`
                          : `${totalResults} live result${totalResults === 1 ? "" : "s"}`
                        : "Type at least two characters"}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.16em",
                      color: "#8A8174",
                      textAlign: "right",
                    }}
                  >
                    Breaking news
                    <br />
                    OG + video + music
                  </div>
                </div>

                {groups.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 10,
                    }}
                  >
                    {groups.map((group) => {
                      const sectionStyle = SECTION_STYLES[group.section];
                      return (
                        <span
                          key={group.section}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "2px 7px",
                            border: `1px solid ${sectionStyle.border}`,
                            backgroundColor: sectionStyle.chipBg,
                            color: sectionStyle.chipText,
                            fontFamily: "monospace",
                            fontSize: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.16em",
                          }}
                        >
                          {group.shortLabel}
                          <span style={{ opacity: 0.72 }}>{group.count}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: "6px 10px 10px" }}>
                {loading && groups.length === 0 ? (
                  <div style={{ padding: "10px 4px" }}>
                    {[0, 1, 2].map((row) => (
                      <div
                        key={row}
                        style={{
                          borderBottom: "1px solid #DDD4C4",
                          padding: "10px 4px",
                        }}
                      >
                        <div
                          style={{
                            width: "32%",
                            height: 8,
                            background: "#DDD4C4",
                            marginBottom: 8,
                          }}
                        />
                        <div
                          style={{
                            width: "88%",
                            height: 13,
                            background: "#CFC5B5",
                            marginBottom: 6,
                          }}
                        />
                        <div
                          style={{
                            width: "72%",
                            height: 10,
                            background: "#E6DDCF",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : totalResults === 0 && hasSearched ? (
                  <div
                    style={{
                      padding: "18px 8px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "serif",
                        fontStyle: "italic",
                        fontSize: 18,
                        color: "#6B665E",
                        marginBottom: 6,
                      }}
                    >
                      No matches right now.
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: "9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        color: "#8A8174",
                      }}
                    >
                      Try a topic, source, artist, tag, or claim
                    </div>
                  </div>
                ) : (
                  groups.map((group) => (
                    <section
                      key={group.section}
                      style={{
                        borderTop: `2px solid ${SECTION_STYLES[group.section].border}`,
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "8px 4px 6px",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.18em",
                            color: SECTION_STYLES[group.section].border,
                          }}
                        >
                          {group.label}
                        </div>
                        <div
                          style={{
                            fontFamily: "monospace",
                            fontSize: "8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.14em",
                            color: "#8A8174",
                          }}
                        >
                          {group.count} shown
                        </div>
                      </div>

                      <div>
                        {group.results.map((result) => (
                          <SearchResultRow
                            key={result.id}
                            result={result}
                            onSelect={() => {
                              setIsOpen(false);
                              setQuery("");
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function SearchResultRow({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  const meta = buildMeta(result);
  const tags = (result.tags ?? []).slice(0, 4).join(" · ");
  const content = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 3,
        }}
      >
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#756C60",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {meta}
        </div>
        {result.external && (
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "#8A8174",
              flexShrink: 0,
            }}
          >
            out
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "15px",
          lineHeight: 1.22,
          color: "#1A1A1A",
          marginBottom: result.subtitle ? 4 : 0,
        }}
      >
        {result.title}
      </div>
      {result.subtitle && (
        <div
          style={{
            fontFamily: "'Libre Baskerville', Georgia, serif",
            fontSize: "11px",
            lineHeight: 1.45,
            color: "#4C473F",
          }}
        >
          {result.subtitle}
        </div>
      )}
      {tags && (
        <div
          style={{
            marginTop: 5,
            fontFamily: "monospace",
            fontSize: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "#8A8174",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tags}
        </div>
      )}
    </>
  );

  const commonStyle = {
    display: "block",
    padding: "10px 6px 11px",
    borderBottom: "1px solid #E6DDCF",
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.12s ease",
  } as const;

  if (result.external) {
    return (
      <a
        href={result.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSelect}
        style={commonStyle}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = "#EDE6D6";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = "#F5F0E8";
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={result.href}
      onClick={onSelect}
      style={commonStyle}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = "#EDE6D6";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = "#F5F0E8";
      }}
    >
      {content}
    </Link>
  );
}
