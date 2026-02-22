"use client";

import Link from "next/link";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
} from "@/lib/governance";

interface ProposalRowProps {
  proposal: Proposal;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot?: string }> = {
  active: { bg: "bg-[#31F387]/10", text: "text-[#31F387]", dot: "bg-[#31F387]" },
  pending: { bg: "bg-yellow-400/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  candidate: { bg: "bg-amber-400/10", text: "text-amber-400", dot: "bg-amber-400" },
  succeeded: { bg: "bg-[#2F80ED]/10", text: "text-[#2F80ED]" },
  queued: { bg: "bg-purple-400/10", text: "text-purple-400" },
  executed: { bg: "bg-zinc-700/50", text: "text-zinc-400" },
  defeated: { bg: "bg-[#D0021B]/10", text: "text-[#D0021B]" },
  closed: { bg: "bg-zinc-700/50", text: "text-zinc-500" },
};

export function ProposalRow({ proposal }: ProposalRowProps) {
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const colors = STATUS_COLORS[proposal.status] || STATUS_COLORS.closed;
  const isActive = proposal.status === "active";
  const isCandidate = proposal.status === "candidate";
  const isParliament = proposal.source === "parliament";

  // Build the appropriate link
  let href = `/proposals/${encodeURIComponent(proposal.id)}`;
  if (isCandidate && proposal.candidateSlug) {
    href = `/proposals/candidate/${encodeURIComponent(proposal.candidateSlug)}`;
  } else if (isParliament && proposal.divisionId) {
    const chamber = (proposal.chamber || "commons").toLowerCase();
    href = `/proposals/division/${proposal.divisionId}?chamber=${chamber}`;
  }

  return (
    <Link href={href}>
      <div className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4 transition-all hover:border-zinc-600 hover:bg-zinc-900/80">
        {/* Proposal number / DAO icon */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          {isParliament ? (
            <span className="text-2xl" role="img" aria-label="UK">🇬🇧</span>
          ) : (
            <img
              src={proposal.daoLogo}
              alt={proposal.dao}
              className="h-8 w-8 rounded-full"
              loading="lazy"
            />
          )}
          {proposal.proposalNumber != null && (
            <span className="text-[10px] font-bold text-zinc-500">
              #{proposal.proposalNumber}
            </span>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white transition-colors group-hover:text-[#2F80ED]">
              {proposal.title}
            </h3>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
            <span>{proposal.dao}</span>
            {isParliament && proposal.chamber && (
              <>
                <span>&middot;</span>
                <span className={proposal.chamber === "Commons" ? "text-green-400" : "text-red-400"}>
                  {proposal.chamber}
                </span>
              </>
            )}
            {!isParliament && proposal.proposer && (
              <>
                <span>&middot;</span>
                <AddressDisplay address={proposal.proposer} />
              </>
            )}
            {proposal.source === "onchain" && !isCandidate && (
              <>
                <span>&middot;</span>
                <span className="uppercase tracking-wider">Onchain</span>
              </>
            )}
            {isCandidate && (
              <>
                <span>&middot;</span>
                <span className="text-amber-400">
                  {proposal.candidateSignatures || 0}/{proposal.candidateThreshold || 0} sponsors
                </span>
              </>
            )}
          </div>
        </div>

        {/* Vote bar (compact) */}
        <div className="hidden w-32 shrink-0 sm:block">
          {isCandidate ? (
            /* Sponsor progress bar for candidates */
            <>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`transition-all ${proposal.candidateIsPromotable ? "bg-[#31F387]" : "bg-amber-400"}`}
                  style={{
                    width: `${
                      (proposal.candidateThreshold || 0) > 0
                        ? Math.min(100, Math.round(((proposal.candidateSignatures || 0) / (proposal.candidateThreshold || 1)) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="mt-1 text-center text-[10px] text-amber-400">
                {proposal.candidateSignatures || 0} / {proposal.candidateThreshold || 0}
              </div>
            </>
          ) : (
            /* Standard vote bar */
            <>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="bg-[#31F387] transition-all"
                  style={{ width: `${forPct}%` }}
                />
                <div
                  className="bg-[#D0021B] transition-all"
                  style={{ width: `${againstPct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px]">
                <span className="text-[#31F387]">
                  {isParliament ? `${proposal.votesFor} Ayes` : `${forPct}%`}
                </span>
                <span className="text-[#D0021B]">
                  {isParliament ? `${proposal.votesAgainst} Noes` : `${againstPct}%`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Status badge */}
        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          {colors.dot && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${colors.dot} ${isActive ? "animate-pulse" : ""}`}
            />
          )}
          {isActive
            ? getTimeRemaining(proposal.endTime)
            : isCandidate
            ? "Candidate"
            : proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
        </div>
      </div>
    </Link>
  );
}
