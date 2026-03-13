"use client";

import Link from "next/link";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
  isDelegationActivityProposal,
} from "@/lib/governance";

interface ProposalRowProps {
  proposal: Proposal;
}

const GOV_FLAGS: Record<string, string> = {
  parliament: "🇬🇧",
  congress: "🇺🇸",
  eu: "🇪🇺",
  canada: "🇨🇦",
  australia: "🇦🇺",
  sec: "📊",
  hyperliquid: "💧",
};

export function ProposalRow({ proposal }: ProposalRowProps) {
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const isActive = proposal.status === "active";
  const isCandidate = proposal.status === "candidate";
  const isDelegationActivity = isDelegationActivityProposal(proposal);
  const isParliament = proposal.source === "parliament";
  const isGov = ["parliament", "congress", "eu", "canada", "australia", "hyperliquid"].includes(proposal.source);
  const flag = GOV_FLAGS[proposal.source] || "";
  const hasDaoLogo = typeof proposal.daoLogo === "string" && proposal.daoLogo.trim().length > 0;
  const hasVotes = !isDelegationActivity && proposal.votesFor + proposal.votesAgainst > 0;

  let href = `/proposals/${encodeURIComponent(proposal.id)}`;
  if (isCandidate && proposal.candidateSlug) {
    href = `/proposals/candidate/${encodeURIComponent(proposal.candidateSlug)}`;
  } else if (isParliament && proposal.divisionId) {
    const chamber = (proposal.chamber || "commons").toLowerCase();
    href = `/proposals/division/${proposal.divisionId}?chamber=${chamber}`;
  }

  return (
    <Link href={href}>
      <div className="group flex items-center gap-4 border-b border-[var(--rule-light)] px-4 py-3 transition-colors hover:bg-[var(--paper-dark)]">
        {/* Icon / flag */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {flag ? (
            <span className="text-lg">{flag}</span>
          ) : hasDaoLogo ? (
            <img
              src={proposal.daoLogo}
              alt={proposal.dao}
              className="newspaper-img h-7 w-7 rounded-full"
              loading="lazy"
            />
          ) : (
            <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              DAO
            </span>
          )}
          {proposal.proposalNumber != null && (
            <span className="font-mono text-[8px] text-[var(--ink-faint)]">
              #{proposal.proposalNumber}
            </span>
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-headline-serif text-sm font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent-red)]">
            {proposal.title}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span>{proposal.dao}</span>
            {isGov && proposal.chamber && (
              <>
                <span>&middot;</span>
                <span>{proposal.chamber}</span>
              </>
            )}
            {!isGov && proposal.proposer && (
              <>
                <span>&middot;</span>
                <AddressDisplay address={proposal.proposer} />
              </>
            )}
            {isDelegationActivity && (
              <>
                <span>&middot;</span>
                <span className="font-bold text-[var(--ink-light)]">
                  Delegation activity
                </span>
              </>
            )}
            {isCandidate && (
              <>
                <span>&middot;</span>
                <span className="font-bold text-[var(--ink-light)]">
                  {proposal.candidateSignatures || 0}/{proposal.candidateThreshold || 0} sponsors
                </span>
              </>
            )}
          </div>
        </div>

        {/* Monochrome vote bar */}
        <div className="hidden w-28 shrink-0 sm:block">
          {isCandidate ? (
            <>
              <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
                <div
                  className="bg-[var(--ink)]"
                  style={{
                    width: `${
                      (proposal.candidateThreshold || 0) > 0
                        ? Math.min(100, Math.round(((proposal.candidateSignatures || 0) / (proposal.candidateThreshold || 1)) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="mt-0.5 text-center font-mono text-[8px] text-[var(--ink-faint)]">
                {proposal.candidateSignatures || 0} / {proposal.candidateThreshold || 0}
              </p>
            </>
          ) : hasVotes ? (
            <>
              <div className="flex h-1 overflow-hidden bg-[var(--paper-dark)]">
                <div className="bg-[var(--ink)]" style={{ width: `${forPct}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between font-mono text-[8px] text-[var(--ink-faint)]">
                <span>{isGov ? `${proposal.votesFor} Ayes` : `${forPct}%`}</span>
                <span>{isGov ? `${proposal.votesAgainst} Noes` : `${againstPct}%`}</span>
              </div>
            </>
          ) : null}
        </div>

        {/* Status — monospace text label */}
        <div className="shrink-0">
          <span
            className={`font-mono text-[9px] font-bold uppercase tracking-widest ${
              isActive ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
            }`}
          >
            {isActive
              ? getTimeRemaining(proposal.endTime)
              : isCandidate
                ? "Candidate"
                : isDelegationActivity
                  ? "Delegation"
                  : proposal.status}
          </span>
        </div>
      </div>
    </Link>
  );
}
