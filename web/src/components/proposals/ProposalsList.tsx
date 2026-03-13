"use client";

import { useState } from "react";
import { isDelegationActivityProposal, type Proposal } from "@/lib/governance";
import { ProposalRow } from "./ProposalRow";

interface ProposalsListProps {
  proposals: Proposal[];
}

type StatusFilter =
  | "all"
  | "active"
  | "activity"
  | "candidates"
  | "pending"
  | "parliament"
  | "hyperliquid"
  | "closed";

export function ProposalsList({ proposals }: ProposalsListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = proposals.filter((p) => {
    if (statusFilter === "active" && p.status !== "active") return false;
    if (statusFilter === "activity" && !isDelegationActivityProposal(p)) return false;
    if (statusFilter === "candidates" && p.status !== "candidate") return false;
    if (statusFilter === "pending" && p.status !== "pending") return false;
    if (statusFilter === "parliament" && p.source !== "parliament") return false;
    if (statusFilter === "hyperliquid" && p.source !== "hyperliquid") return false;
    if (
      statusFilter === "closed" &&
      !["closed", "defeated", "executed", "succeeded"].includes(p.status)
    )
      return false;

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
  const activityCount = proposals.filter((p) => isDelegationActivityProposal(p)).length;
  const candidateCount = proposals.filter((p) => p.status === "candidate").length;
  const parliamentCount = proposals.filter((p) => p.source === "parliament").length;
  const hyperliquidCount = proposals.filter((p) => p.source === "hyperliquid").length;

  return (
    <div>
      {/* Stats bar — newspaper ruled boxes */}
      <div className="mb-5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
        <span className="flex items-center gap-1.5 border border-[var(--rule-light)] px-3 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ink)]" />
          <span className="font-bold text-[var(--ink)]">{activeCount} Active</span>
        </span>
        {candidateCount > 0 && (
          <span className="border border-[var(--rule-light)] px-3 py-1.5 text-[var(--ink-light)]">
            {candidateCount} Candidates
          </span>
        )}
        {activityCount > 0 && (
          <span className="border border-[var(--rule-light)] px-3 py-1.5 text-[var(--ink-light)]">
            {activityCount} Activity
          </span>
        )}
        {parliamentCount > 0 && (
          <span className="border border-[var(--rule-light)] px-3 py-1.5 text-[var(--ink-light)]">
            🇬🇧 {parliamentCount} Parliament
          </span>
        )}
        {hyperliquidCount > 0 && (
          <span className="border border-[var(--rule-light)] px-3 py-1.5 text-[var(--ink-light)]">
            💧 {hyperliquidCount} Hyperliquid
          </span>
        )}
        <span className="text-[var(--ink-faint)]">
          {proposals.length} Total
        </span>
      </div>

      {/* Filters — pipe-separated + search */}
      <div className="mb-5 flex flex-wrap items-center gap-0 border-b border-[var(--rule-light)] pb-3 font-mono text-[10px] uppercase tracking-wider">
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["activity", "Activity"],
            ["candidates", "Candidates"],
            ["parliament", "Parliament"],
            ["hyperliquid", "Hyperliquid"],
            ["pending", "Pending"],
            ["closed", "Closed"],
          ] as const
        ).map(([value, label], i) => (
          <span key={value} className="flex items-center">
            {i > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setStatusFilter(value)}
              className={`transition-colors ${
                statusFilter === value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4 decoration-[var(--rule)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          </span>
        ))}

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto border border-[var(--rule-light)] bg-[var(--paper)] px-3 py-1.5 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--rule)]"
        />
      </div>

      {/* Proposal rows */}
      <div className="border-t-2 border-[var(--rule)]">
        {filtered.length === 0 ? (
          <div className="py-12 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            No proposals match your filters.
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
