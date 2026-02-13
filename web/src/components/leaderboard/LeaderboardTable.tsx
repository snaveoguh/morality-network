"use client";

import { useState } from "react";
import { EntityType } from "@/lib/contracts";
import { EntityBadge } from "@/components/shared/EntityBadge";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { StarRating } from "@/components/shared/StarRating";
import Link from "next/link";

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
      {/* Entity type filter */}
      <div className="mb-6 flex gap-1">
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilterType(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filterType === f.value
                ? "bg-[#2F80ED]/10 text-[#31F387]"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Entity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Rating
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Tips
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Comments
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                AI Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {filtered.map((entry, i) => (
              <tr
                key={entry.entityHash}
                className="transition-colors hover:bg-zinc-800/30"
              >
                <td className="px-4 py-3">
                  <span
                    className={`text-sm font-bold ${
                      i < 3 ? "text-[#31F387]" : "text-zinc-500"
                    }`}
                  >
                    #{entry.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/entity/${entry.entityHash}`}
                    className="text-sm font-medium text-white hover:text-[#31F387]"
                  >
                    {entry.entityType === EntityType.ADDRESS ||
                    entry.entityType === EntityType.CONTRACT ? (
                      <AddressDisplay address={entry.identifier} chars={6} />
                    ) : (
                      <span className="max-w-[300px] truncate block">
                        {entry.identifier}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <EntityBadge entityType={entry.entityType} />
                </td>
                <td className="px-4 py-3">
                  <StarRating
                    rating={entry.avgRating}
                    size="sm"
                    count={entry.ratingCount}
                  />
                </td>
                <td className="px-4 py-3 text-sm text-[#31F387]">
                  {entry.tipTotal}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-400">
                  {entry.commentCount}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-[#2F80ED]"
                        style={{ width: `${entry.aiScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400">
                      {entry.aiScore}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-white">
                    {entry.compositeScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-zinc-500"
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
