"use client";

import { useState } from "react";
import { GovernanceCard } from "./GovernanceCard";
import type { Proposal } from "@/lib/governance";

interface GovernanceSectionProps {
  proposals: Proposal[];
}

type Filter = "all" | "active" | "controversial" | "closed";

export function GovernanceSection({ proposals }: GovernanceSectionProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);

  const activeCount = proposals.filter((p) => p.status === "active").length;
  const controversialCount = proposals.filter((p) => p.isControversial).length;

  const filtered =
    filter === "all"
      ? proposals
      : filter === "active"
        ? proposals.filter((p) => p.status === "active" || p.status === "pending")
        : filter === "controversial"
          ? proposals.filter((p) => p.isControversial)
          : proposals.filter((p) => p.status === "closed" || p.status === "defeated" || p.status === "executed" || p.status === "succeeded");

  const displayed = expanded ? filtered : filtered.slice(0, 4);

  if (proposals.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">
            DAO Governance
          </h2>
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#31F387]/10 px-2.5 py-0.5 text-xs font-medium text-[#31F387]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#31F387]" />
              {activeCount} Live
            </span>
          )}
          {controversialCount > 0 && (
            <span className="rounded-full bg-[#D0021B]/10 px-2.5 py-0.5 text-xs font-medium text-[#D0021B]">
              {controversialCount} Controversial
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Tip proposers directly
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-1">
        {(
          [
            ["all", "All"],
            ["active", "Live Votes"],
            ["controversial", "Controversial"],
            ["closed", "Closed"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === value
                ? "bg-[#2F80ED]/10 text-[#2F80ED]"
                : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Proposal cards */}
      <div className="space-y-3">
        {displayed.map((proposal) => (
          <GovernanceCard key={proposal.id} proposal={proposal} />
        ))}
      </div>

      {/* Show more/less */}
      {filtered.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full rounded-lg border border-zinc-800 py-2.5 text-sm text-zinc-400 transition-colors hover:border-[#2F80ED] hover:text-[#2F80ED]"
        >
          {expanded
            ? "Show less"
            : `Show ${filtered.length - 4} more proposals`}
        </button>
      )}
    </div>
  );
}
