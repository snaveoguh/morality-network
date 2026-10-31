"use client";

import { useState } from "react";
import Link from "next/link";
import { EntityType } from "@/lib/contracts";
import { entityTypeLabel } from "@/lib/entity";
import {
  BIAS_LABELS,
  FACTUALITY_LABELS,
  type BiasRating,
  type FactualityRating,
} from "@/lib/bias";

interface LeaderboardEntry {
  rank: number;
  entityHash: string;
  identifier: string;
  entityType: EntityType;
  itemCount: number;
  activeCount?: number;
  logo?: string;
  biasRating?: string | null;
  factuality?: string | null;
  categories?: string[];
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

type Filter = "all" | "sources" | "governance";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "all" },
  { label: "News sources", value: "sources" },
  { label: "Governance", value: "governance" },
];

const TH =
  "px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]";

function biasLabel(bias?: string | null): string {
  return bias ? BIAS_LABELS[bias as BiasRating] ?? bias : "—";
}

function factualityLabel(f?: string | null): string {
  return f ? FACTUALITY_LABELS[f as FactualityRating] ?? f : "—";
}

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = entries.filter((e) =>
    filter === "all"
      ? true
      : filter === "sources"
        ? e.entityType === EntityType.DOMAIN
        : e.entityType !== EntityType.DOMAIN,
  );

  return (
    <div>
      <h2 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        What we track
      </h2>
      <p className="mb-4 font-mono text-[9px] text-[var(--ink-faint)]">
        News sources in the live feed, with their published bias and factuality ratings,
        and the governance bodies whose proposals we follow. Counts come from the latest crawl.
        Tap any row to rate it onchain.
      </p>

      <div className="mb-5 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
        {FILTERS.map((f, i) => (
          <span key={f.value} className="flex items-center">
            {i > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setFilter(f.value)}
              className={`transition-colors ${
                filter === f.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          </span>
        ))}
        <span className="ml-auto text-[var(--ink-faint)]">{filtered.length} tracked</span>
      </div>

      <div className="overflow-x-auto border-t-2 border-[var(--rule)]">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-[var(--rule)]">
              <th className={TH}>Name</th>
              <th className={TH}>Bias</th>
              <th className={TH}>Factuality</th>
              <th className={`${TH} text-right`}>In feed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => {
              const isSource = entry.entityType === EntityType.DOMAIN;
              return (
                <tr
                  key={entry.entityHash}
                  className="border-b border-[var(--rule-light)] transition-colors hover:bg-[var(--paper-dark)]"
                >
                  <td className="px-3 py-2.5">
                    <Link href={buildEntityHref(entry)} className="group flex items-center gap-2">
                      {entry.logo && (
                        <img
                          src={entry.logo}
                          alt=""
                          className="newspaper-img h-4 w-4 rounded-full"
                          loading="lazy"
                        />
                      )}
                      <span className="max-w-[240px] truncate font-headline-serif text-sm font-semibold text-[var(--ink)] transition-colors group-hover:underline">
                        {entry.identifier}
                      </span>
                    </Link>
                    <div className="mt-0.5 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {isSource
                        ? (entry.categories ?? []).slice(0, 3).join(" · ")
                        : "Governance"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--ink-light)]">
                    {isSource ? biasLabel(entry.biasRating) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--ink-light)]">
                    {isSource ? factualityLabel(entry.factuality) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-[var(--ink-light)]">
                    {isSource
                      ? `${entry.itemCount} ${entry.itemCount === 1 ? "story" : "stories"}`
                      : `${entry.itemCount} proposals${entry.activeCount ? ` · ${entry.activeCount} open` : ""}`}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center font-body-serif text-sm italic text-[var(--ink-faint)]"
                >
                  The feed is still loading. Try again in a minute.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildEntityHref(entry: LeaderboardEntry): string {
  const params = new URLSearchParams({
    title: entry.identifier,
    source: "Universal Ledger",
    type: entityTypeLabel(entry.entityType).toLowerCase(),
  });

  const descriptionParts = [
    entry.categories?.length ? entry.categories.slice(0, 3).join(", ") : null,
    entry.biasRating ? `bias: ${entry.biasRating}` : null,
    entry.factuality ? `factuality: ${entry.factuality}` : null,
  ].filter(Boolean);

  if (descriptionParts.length > 0) {
    params.set("description", descriptionParts.join(" · "));
  }

  return `/entity/${entry.entityHash}?${params.toString()}`;
}