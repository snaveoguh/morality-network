"use client";

import { useState } from "react";
import type { Proposal } from "@/lib/governance";
import { ProposalRow } from "./ProposalRow";

interface ProposalsListProps {
  proposals: Proposal[];
}

type StatusFilter = "all" | "active" | "candidates" | "pending" | "parliament" | "closed";

export function ProposalsList({ proposals }: ProposalsListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = proposals.filter((p) => {
    // Status filter
    if (statusFilter === "active" && p.status !== "active") return false;
    if (statusFilter === "candidates" && p.status !== "candidate") return false;
    if (statusFilter === "pending" && p.status !== "pending") return false;
    if (statusFilter === "parliament" && p.source !== "parliament") return false;
    if (
      statusFilter === "closed" &&
      !["closed", "defeated", "executed", "succeeded"].includes(p.status)
    )
      return false;

    // Search
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.title.toLowerCase().includes(q) &&
        !p.dao.toLowerCase().includes(q) &&
        !p.proposer.toLowerCase().includes(q)
      )
        return false;
    }

    return true;
  });

  const activeCount = proposals.filter((p) => p.status === "active").length;
  const candidateCount = proposals.filter((p) => p.status === "candidate").length;
  const parliamentCount = proposals.filter((p) => p.source === "parliament").length;

  return (
    <div>
      {/* Stats bar */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#31F387]" />
          <span className="text-sm font-medium text-white">
            {activeCount} Active
          </span>
        </div>
        {candidateCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-white">
              {candidateCount} Candidates
            </span>
          </div>
        )}
        {parliamentCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2">
            <span className="text-sm">🇬🇧</span>
            <span className="text-sm font-medium text-white">
              {parliamentCount} Parliament
            </span>
          </div>
        )}
        <div className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
          {proposals.length} Total Proposals
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">

        {/* Status filter */}
        <div className="flex gap-1 rounded-lg bg-zinc-900/50 p-1">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["candidates", "Candidates"],
              ["parliament", "Parliament"],
              ["pending", "Pending"],
              ["closed", "Closed"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === value
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search proposals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-[#2F80ED]"
        />
      </div>

      {/* Proposal rows */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 py-12 text-center">
            <p className="text-zinc-500">No proposals match your filters.</p>
          </div>
        ) : (
          filtered.map((proposal) => (
            <ProposalRow key={proposal.id} proposal={proposal} />
          ))
        )}
      </div>
    </div>
  );
}
