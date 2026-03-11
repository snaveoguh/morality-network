"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
} from "@/lib/governance";

// ============================================================================
// TYPES
// ============================================================================

interface ProposalColumnProps {
  proposals: Proposal[];
}

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "dao", label: "DAOs" },
  { value: "government", label: "Gov" },
  { value: "corporate", label: "Corp" },
];

const SOURCE_FLAGS: Record<string, string> = {
  parliament: "🇬🇧",
  congress: "🇺🇸",
  eu: "🇪🇺",
  canada: "🇨🇦",
  australia: "🇦🇺",
  sec: "📊",
};

// ============================================================================
// COMPONENT — "The Parliamentary Register"
// ============================================================================

export function ProposalColumn({ proposals }: ProposalColumnProps) {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showCount, setShowCount] = useState(25);

  const filtered = useMemo(() => {
    let result = proposals;
    if (sourceFilter === "dao") {
      result = result.filter(
        (p) => p.source === "snapshot" || p.source === "onchain" || p.source === "tally"
      );
    } else if (sourceFilter === "government") {
      result = result.filter(
        (p) => p.source === "parliament" || p.source === "congress" || p.source === "eu" || p.source === "canada" || p.source === "australia"
      );
    } else if (sourceFilter === "corporate") {
      result = result.filter((p) => p.source === "sec");
    }
    return result;
  }, [proposals, sourceFilter]);

  const visible = filtered.slice(0, showCount);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of proposals) {
      counts[p.source] = (counts[p.source] || 0) + 1;
    }
    return counts;
  }, [proposals]);

  return (
    <div className="sticky top-16 overflow-hidden">
      {/* Title — monospace small-caps */}
      <div className="mb-3 border-b-2 border-[var(--rule)] pb-2">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Parliamentary Register
        </h2>
        <p className="mt-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
          {proposals.length} proposals &amp; votes
        </p>
      </div>

      {/* Source counts */}
      <div className="mb-3 flex flex-wrap gap-0.5 overflow-hidden">
        {Object.entries(sourceCounts).map(([source, count]) => (
          <span
            key={source}
            className="border border-[var(--rule-light)] px-1 py-0.5 font-mono text-[7px] text-[var(--ink-faint)]"
          >
            {SOURCE_FLAGS[source] || ""} {source} {count}
          </span>
        ))}
      </div>

      {/* Filter — pipe-separated text buttons */}
      <div className="mb-3 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
        {SOURCE_FILTERS.map((f, i) => (
          <span key={f.value} className="flex items-center">
            {i > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setSourceFilter(f.value)}
              className={`transition-colors ${
                sourceFilter === f.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-4"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {f.label}
            </button>
          </span>
        ))}
      </div>

      {/* Proposals list */}
      <div className="max-h-[calc(100vh-220px)] space-y-0 overflow-y-auto pr-1">
        {visible.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}

        {filtered.length > showCount && (
          <button
            onClick={() => setShowCount((c) => c + 25)}
            className="w-full border-t border-[var(--rule-light)] py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            Load more ({filtered.length - showCount} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROPOSAL CARD — compact ruled card
// ============================================================================

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const isActive = proposal.status === "active";
  const hasVotes = proposal.votesFor + proposal.votesAgainst > 0;
  const flag = SOURCE_FLAGS[proposal.source] || "";

  const href = proposal.source === "snapshot" || proposal.source === "onchain" || proposal.source === "tally"
    ? `/proposals/${encodeURIComponent(proposal.id)}`
    : proposal.link;
  const isExternal = !href.startsWith("/");

  return (
    <div className="border-t border-[var(--rule-light)] py-2.5 transition-colors hover:bg-[var(--paper-dark)]">
      {/* Header */}
      <div className="mb-1 flex items-center gap-1 overflow-hidden">
        {flag && <span className="shrink-0 text-[10px]">{flag}</span>}
        {proposal.daoLogo && !flag && (
          <img
            src={proposal.daoLogo}
            alt=""
            className="newspaper-img h-3.5 w-3.5 shrink-0 rounded-full"
            loading="lazy"
          />
        )}
        <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          {proposal.dao}
        </span>
        <span className={`ml-auto shrink-0 font-mono text-[8px] uppercase tracking-wider ${isActive ? "font-bold text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}>
          {isActive ? getTimeRemaining(proposal.endTime) : proposal.status}
        </span>
      </div>

      {/* Title */}
      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          <h3 className="line-clamp-2 font-headline-serif text-xs font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]">
            {proposal.title}
          </h3>
        </a>
      ) : (
        <Link href={href}>
          <h3 className="line-clamp-2 font-headline-serif text-xs font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]">
            {proposal.title}
          </h3>
        </Link>
      )}

      {/* Monochrome vote bar */}
      {hasVotes && (
        <div className="mt-1.5">
          <div className="flex h-0.5 overflow-hidden bg-[var(--paper-dark)]">
            <div className="bg-[var(--ink)]" style={{ width: `${forPct}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span>
              {proposal.votesFor.toLocaleString()} {["parliament","congress","canada","australia"].includes(proposal.source) ? "Ayes" : "For"}
            </span>
            <span>
              {proposal.votesAgainst.toLocaleString()} {["parliament","congress","canada","australia"].includes(proposal.source) ? "Noes" : "Against"}
            </span>
          </div>
        </div>
      )}

      {/* Tags */}
      {proposal.tags && proposal.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {proposal.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[7px] text-[var(--ink-faint)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
