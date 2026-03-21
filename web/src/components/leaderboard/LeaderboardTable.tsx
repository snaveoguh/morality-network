"use client";

import { useState } from "react";
import { EntityType } from "@/lib/contracts";
import { EntityBadge } from "@/components/shared/EntityBadge";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { StarRating } from "@/components/shared/StarRating";
import Link from "next/link";
import { entityTypeLabel } from "@/lib/entity";

interface LeaderboardEntry {
  rank: number;
  entityHash: string;
  identifier: string;
  entityType: EntityType;
  avgRating: number;
  ratingCount: number;
  tipTotal: string;
  commentCount: number;
  aiScore: number;
  compositeScore: number;
  logo?: string;
  biasRating?: string | null;
  factuality?: string | null;
  categories?: string[];
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

const ENTITY_FILTERS = [
  { label: "All", value: null },
  { label: "Domains", value: EntityType.DOMAIN },
  { label: "Addresses", value: EntityType.ADDRESS },
  { label: "Contracts", value: EntityType.CONTRACT },
  { label: "URLs", value: EntityType.URL },
];

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const [filterType, setFilterType] = useState<EntityType | null>(null);

  const filtered =
    filterType === null
      ? entries
      : entries.filter((e) => e.entityType === filterType);

  return (
    <div>
      {/* Entity type filter — pipe-separated monospace buttons */}
      <div className="mb-5 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
        {ENTITY_FILTERS.map((f, i) => (
          <span key={f.label} className="flex items-center">
            {i > 0 && (
              <span className="mx-1.5 text-[var(--rule-light)]">|</span>
            )}
            <button
              onClick={() => setFilterType(f.value)}
              className={`transition-colors ${
                filterType === f.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          </span>
        ))}
        <span className="ml-auto text-[var(--ink-faint)]">
          {filtered.length} entities
        </span>
      </div>

      {/* Table — newspaper ruled style */}
      <div className="overflow-x-auto border-t-2 border-[var(--rule)]">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-[var(--rule)]">
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                №
              </th>
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                Entity
              </th>
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                Type
              </th>
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                Rating
              </th>
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                Items
              </th>
              <th className="px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                AI
              </th>
              <th className="px-3 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => (
              <tr
                key={entry.entityHash}
                className="border-b border-[var(--rule-light)] transition-colors hover:bg-[var(--paper-dark)]"
              >
                {/* Rank */}
                <td className="px-3 py-2.5">
                  <span
                    className={`font-mono text-sm ${
                      i < 3
                        ? "font-bold text-[var(--ink)]"
                        : "text-[var(--ink-faint)]"
                    }`}
                  >
                    {entry.rank}
                  </span>
                </td>

                {/* Entity */}
                <td className="px-3 py-2.5">
                  <Link
                    href={buildEntityHref(entry)}
                    className="group flex items-center gap-2"
                  >
                    {entry.logo && (
                      <img
                        src={entry.logo}
                        alt=""
                        className="newspaper-img h-4 w-4 rounded-full"
                        loading="lazy"
                      />
                    )}
                    <span className="max-w-[240px] truncate font-headline-serif text-sm font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)]">
                      {entry.entityType === EntityType.ADDRESS ||
                      entry.entityType === EntityType.CONTRACT ? (
                        <AddressDisplay address={entry.identifier} chars={6} />
                      ) : (
                        entry.identifier
                      )}
                    </span>
                  </Link>
                  {entry.categories && entry.categories.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {entry.categories.slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                {/* Type */}
                <td className="px-3 py-2.5">
                  <EntityBadge entityType={entry.entityType} />
                </td>

                {/* Rating */}
                <td className="px-3 py-2.5">
                  <StarRating
                    rating={entry.avgRating}
                    size="sm"
                    count={entry.ratingCount}
                  />
                </td>

                {/* Items count */}
                <td className="px-3 py-2.5 font-mono text-xs text-[var(--ink-light)]">
                  {entry.ratingCount}
                </td>

                {/* AI Score — monochrome bar */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 overflow-hidden bg-[var(--paper-dark)]">
                      <div
                        className="h-full bg-[var(--ink)]"
                        style={{ width: `${entry.aiScore}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      {entry.aiScore}
                    </span>
                  </div>
                </td>

                {/* Composite Score */}
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={`font-mono text-sm ${
                      i < 3
                        ? "font-bold text-[var(--ink)]"
                        : "text-[var(--ink-light)]"
                    }`}
                  >
                    {entry.compositeScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center font-body-serif text-sm italic text-[var(--ink-faint)]"
                >
                  No entities ranked yet. Be the first to rate something.
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
