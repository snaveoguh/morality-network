"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { computeEntityHash } from "@/lib/entity";

interface SearchResult {
  type: "rss" | "governance";
  title: string;
  source: string;
  category: string;
  link: string;
  pubDate?: string;
  id?: string;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  }

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // Compute dropdown position
  function getDropdownPos() {
    if (!inputRef.current) return { top: 0, left: 0, width: 0 };
    const rect = inputRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 320),
    };
  }

  return (
    <>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder="Tag search..."
          className="w-24 border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] transition-all focus:w-40 focus:border-[var(--rule)] focus:outline-none"
        />
        {loading && (
          <span className="absolute right-1.5 h-2 w-2 animate-spin border border-[var(--ink)] border-t-transparent" />
        )}
      </div>

      {/* Dropdown results */}
      {mounted && isOpen && results.length > 0 && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99996 }} onClick={() => setIsOpen(false)} />
          <div
            ref={dropRef}
            style={{
              position: "fixed",
              ...getDropdownPos(),
              maxHeight: 360,
              overflowY: "auto",
              zIndex: 99997,
              backgroundColor: "#F5F0E8",
              border: "2px solid #2A2A2A",
              boxShadow: "4px 4px 0 rgba(26,26,26,0.12)",
            }}
          >
            <div style={{
              padding: "4px 8px",
              fontFamily: "monospace",
              fontSize: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#8A8A8A",
              borderBottom: "1px solid #C8C0B0",
            }}>
              {results.length} result{results.length !== 1 ? "s" : ""}
            </div>
            {results.map((r, i) => {
              const href = r.type === "rss"
                ? `/article/${computeEntityHash(r.link)}`
                : r.id
                  ? `/proposals/${encodeURIComponent(r.id)}`
                  : r.link;
              const isExternal = !href.startsWith("/");

              return isExternal ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setIsOpen(false); setQuery(""); }}
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderBottom: "1px solid #EDE6D6",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#EDE6D6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#F5F0E8"; }}
                >
                  <ResultContent r={r} />
                </a>
              ) : (
                <Link
                  key={i}
                  href={href}
                  onClick={() => { setIsOpen(false); setQuery(""); }}
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderBottom: "1px solid #EDE6D6",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#EDE6D6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#F5F0E8"; }}
                >
                  <ResultContent r={r} />
                </Link>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function ResultContent({ r }: { r: SearchResult }) {
  return (
    <>
      <div style={{
        fontFamily: "monospace",
        fontSize: "8px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#8A8A8A",
        marginBottom: "2px",
      }}>
        <span style={{ fontWeight: "bold", color: "#4A4A4A" }}>{r.source}</span>
        {" \u00B7 "}
        {r.category}
        {r.type === "governance" && " \u00B7 Gov"}
      </div>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "12px",
        lineHeight: "1.3",
        color: "#1A1A1A",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical" as const,
      }}>
        {r.title}
      </div>
    </>
  );
}
