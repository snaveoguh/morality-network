"use client";

import { useEffect, useMemo, useState } from "react";
import type { Society, SocietyHit } from "@/lib/coops/types";

// Local areas ship their own societies and filter them in the browser; once
// the query is 3+ characters the directory also asks /api/coops/search for
// matches elsewhere in the UK, so a society registered outside the area is
// still found. The UK page ships no list and searches the API only.

const PAGE = 40;
const ELSEWHERE_MIN = 3;
const NATIONAL_MIN = 2;

function fcaSearchUrl(name: string): string {
  return `https://mutuals.fca.org.uk/Search/Search?SearchTerm=${encodeURIComponent(name)}`;
}

type Remote = { query: string; total: number; results: SocietyHit[]; error?: boolean };

function useRemoteSearch(query: string, exclude: string | null, min: number): Remote | null {
  const q = query.trim();
  const [remote, setRemote] = useState<Remote | null>(null);

  useEffect(() => {
    if (q.length < min) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (exclude) params.set("exclude", exclude);
      fetch(`/api/coops/search?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: { total: number; results: SocietyHit[] }) =>
          setRemote({ query: q, total: data.total, results: data.results }),
        )
        .catch((err: unknown) => {
          if ((err as Error).name !== "AbortError") setRemote({ query: q, total: 0, results: [], error: true });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, exclude, min]);

  return q.length >= min && remote?.query === q ? remote : null;
}

function Row({ s, place }: { s: Pick<Society, "regNo" | "name" | "type" | "sector" | "registered">; place: string }) {
  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
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
        {place}
        {s.registered ? ` · since ${s.registered.slice(0, 4)}` : ""}
        {" · "}
        <span className="font-mono text-xs">{s.regNo}</span>
      </p>
    </li>
  );
}

function hitPlace(s: SocietyHit): string {
  return s.district === s.region ? s.district : `${s.district}, ${s.region}`;
}

const listClass = "mt-2 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]";
const inputClass =
  "w-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] sm:w-auto";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <>
      <label className="sr-only" htmlFor="coop-search">Search co-ops</label>
      <input
        id="coop-search"
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} sm:flex-1`}
      />
    </>
  );
}

function RemoteResults({ remote, query, min, heading }: { remote: Remote | null; query: string; min: number; heading?: string }) {
  if (query.trim().length < min) return null;
  return (
    <div className={heading ? "mt-8" : "mt-1"}>
      {heading && <h3 className="font-headline text-xl font-semibold text-[var(--ink)]">{heading}</h3>}
      {!remote ? (
        <p className="mt-2 text-sm text-[var(--ink-faint)]">Searching…</p>
      ) : remote.error ? (
        <p className="mt-2 text-sm text-[var(--ink-faint)]">The UK search is not available right now.</p>
      ) : remote.total === 0 ? (
        <p className="mt-2 text-sm text-[var(--ink-faint)]">No society elsewhere in the UK matches.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-[var(--ink-faint)]">
            {remote.total > remote.results.length
              ? `First ${remote.results.length} of ${remote.total.toLocaleString("en-GB")} societies. Add more of the name to narrow it down.`
              : `${remote.total} ${remote.total === 1 ? "society" : "societies"}`}
          </p>
          <ul className={listClass}>
            {remote.results.map((s) => (
              <Row key={s.regNo} s={s} place={hitPlace(s)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** UK page: no list shipped; search the whole register through the API. */
function NationalDirectory({ total }: { total: number }) {
  const [query, setQuery] = useState("");
  const remote = useRemoteSearch(query, null, NATIONAL_MIN);
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox value={query} onChange={setQuery} placeholder="Search by name or sector" />
      </div>
      {query.trim().length < NATIONAL_MIN && (
        <p className="mt-3 text-sm text-[var(--ink-faint)]">
          Type at least {NATIONAL_MIN} letters to search {total.toLocaleString("en-GB")} societies.
        </p>
      )}
      <RemoteResults remote={remote} query={query} min={NATIONAL_MIN} />
    </div>
  );
}

function LocalDirectory({
  societies,
  districts,
  areaSlug,
  areaName,
}: {
  societies: Society[];
  districts: string[];
  areaSlug: string;
  areaName: string;
}) {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [type, setType] = useState("");
  const [shown, setShown] = useState(PAGE);
  const remote = useRemoteSearch(query, areaSlug, ELSEWHERE_MIN);

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

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox
          value={query}
          onChange={(v) => {
            setQuery(v);
            setShown(PAGE);
          }}
          placeholder="Search by name or sector"
        />
        <select aria-label="District" value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass}>
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ink-light)]">
          No {areaName} society matches. Only societies with a registered office in {areaName} are listed.
        </p>
      ) : (
        <p className="mt-3 text-sm text-[var(--ink-faint)]">
          {matches.length} {matches.length === 1 ? "society" : "societies"}
        </p>
      )}
      {matches.length > 0 && (
        <ul className={listClass}>
          {matches.slice(0, shown).map((s) => (
            <Row key={s.regNo} s={s} place={s.district} />
          ))}
        </ul>
      )}
      {shown < matches.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-4 border border-[var(--rule)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          Show more ({matches.length - shown} left)
        </button>
      )}
      <RemoteResults remote={remote} query={query} min={ELSEWHERE_MIN} heading="Elsewhere in the UK" />
    </div>
  );
}

export function SocietyDirectory(
  props:
    | { national: true; total: number }
    | { national?: false; societies: Society[]; districts: string[]; areaSlug: string; areaName: string },
) {
  if (props.national) return <NationalDirectory total={props.total} />;
  return (
    <LocalDirectory
      societies={props.societies}
      districts={props.districts}
      areaSlug={props.areaSlug}
      areaName={props.areaName}
    />
  );
}
