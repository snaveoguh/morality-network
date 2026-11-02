"use client";

import { useMemo, useState } from "react";
import type { Society } from "@/lib/coops/types";

const PAGE = 40;

function fcaSearchUrl(name: string): string {
  return `https://mutuals.fca.org.uk/Search/Search?SearchTerm=${encodeURIComponent(name)}`;
}

export function SocietyDirectory({ societies, districts }: { societies: Society[]; districts: string[] }) {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [type, setType] = useState("");
  const [shown, setShown] = useState(PAGE);

  const types = useMemo(() => [...new Set(societies.map((s) => s.type))].sort(), [societies]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return societies.filter(
      (s) =>
        (!district || s.district === district) &&
        (!type || s.type === type) &&
        (!q || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q)),
    );
  }, [societies, query, district, type]);

  const select =
    "w-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] sm:w-auto";

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="coop-search">Search co-ops</label>
        <input
          id="coop-search"
          type="search"
          placeholder="Search by name or sector"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          className={`${select} sm:flex-1`}
        />
        <select aria-label="District" value={district} onChange={(e) => setDistrict(e.target.value)} className={select}>
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={select}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-sm text-[var(--ink-faint)]">
        {matches.length} {matches.length === 1 ? "society" : "societies"}
      </p>
      <ul className="mt-2 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
        {matches.slice(0, shown).map((s) => (
          <li key={s.regNo} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <a
                href={fcaSearchUrl(s.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-headline text-base text-[var(--ink)] hover:underline"
              >
                {s.name}
              </a>
              <p className="text-sm text-[var(--ink-light)]">
                {s.type} · {s.sector}
              </p>
            </div>
            <p className="shrink-0 text-sm text-[var(--ink-faint)]">
              {s.district}
              {s.registered ? ` · since ${s.registered.slice(0, 4)}` : ""}
              {" · "}
              <span className="font-mono text-xs">{s.regNo}</span>
            </p>
          </li>
        ))}
      </ul>
      {shown < matches.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-4 border border-[var(--rule)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Show more ({matches.length - shown} left)
        </button>
      )}
    </div>
  );
}
