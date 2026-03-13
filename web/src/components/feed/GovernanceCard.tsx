"use client";

import { useAccount } from "wagmi";
import { TipButton } from "@/components/entity/TipButton";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { computeEntityHash } from "@/lib/entity";
import {
  type Proposal,
  getTimeRemaining,
  getVotePercentage,
  isDelegationActivityProposal,
} from "@/lib/governance";
import Link from "next/link";
import { isAddress } from "viem";

interface GovernanceCardProps {
  proposal: Proposal;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#31F387]/10 text-[#31F387] border-[#31F387]/30",
  pending: "bg-yellow-400/10 text-yellow-400 border-yellow-400/30",
  succeeded: "bg-[#2F80ED]/10 text-[#2F80ED] border-[#2F80ED]/30",
  queued: "bg-purple-400/10 text-purple-400 border-purple-400/30",
  executed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  defeated: "bg-[#D0021B]/10 text-[#D0021B] border-[#D0021B]/30",
  closed: "bg-zinc-600/10 text-zinc-400 border-zinc-600/30",
};

export function GovernanceCard({ proposal }: GovernanceCardProps) {
  const { isConnected } = useAccount();
  const proposer = proposal.proposer?.trim() || "";
  const hasProposerAddress = isAddress(proposer);
  const isDelegationActivity = isDelegationActivityProposal(proposal);
  const proposerHash = hasProposerAddress ? computeEntityHash(proposer) : "";
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const hasVotes = !isDelegationActivity && proposal.votesFor + proposal.votesAgainst > 0;

  return (
    <article className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-zinc-700">
      {/* Header row: DAO info + Status */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src={proposal.daoLogo}
            alt={proposal.dao}
            className="h-6 w-6 rounded-full"
            loading="lazy"
          />
          <span className="text-sm font-medium text-white">{proposal.dao}</span>
          {proposal.source === "onchain" && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Onchain
            </span>
          )}
          {proposal.source === "snapshot" && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Snapshot
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {proposal.isControversial && (
            <span className="rounded-full bg-[#D0021B]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D0021B]">
              Controversial
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              STATUS_STYLES[proposal.status] || STATUS_STYLES.closed
            }`}
          >
            {proposal.status === "active"
              ? getTimeRemaining(proposal.endTime)
              : isDelegationActivity
                ? "Delegation"
                : proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Title */}
      <Link
        href={`/proposals/${encodeURIComponent(proposal.id)}`}
        className="mb-2 block text-base font-semibold text-white transition-colors group-hover:text-[#2F80ED]"
      >
        {proposal.title}
      </Link>

      {/* Description snippet */}
      {proposal.body && (
        <p className="mb-3 line-clamp-2 text-sm text-zinc-400">
          {proposal.body}
        </p>
      )}

      {/* Vote bar */}
      {hasVotes ? (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-[#31F387]">
              For {forPct}%
            </span>
            <span className="text-[#D0021B]">
              Against {againstPct}%
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bg-[#31F387] transition-all"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-[#D0021B] transition-all"
              style={{ width: `${againstPct}%` }}
            />
          </div>
          {proposal.votesAbstain > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              {proposal.votesAbstain.toLocaleString()} abstained
            </p>
          )}
        </div>
      ) : isDelegationActivity ? (
        <p className="mb-3 text-xs text-zinc-500">
          Onchain delegation event. No vote tally applies.
        </p>
      ) : null}

      {/* Footer: Proposer + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Proposed by</span>
          {hasProposerAddress ? (
            <Link href={`/entity/${proposerHash}`}>
              <AddressDisplay
                address={proposer}
                className="text-zinc-300 hover:text-[#2F80ED]"
              />
            </Link>
          ) : (
            <span className="text-xs text-zinc-400">{proposal.proposer}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={proposal.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 transition-colors hover:text-[#2F80ED]"
          >
            {isDelegationActivity ? "View Activity" : "View Vote"}
          </a>

          {/* Tip the proposer directly */}
          {isConnected && hasProposerAddress && (
            <TipButton recipientAddress={proposer} />
          )}
        </div>
      </div>
    </article>
  );
}
