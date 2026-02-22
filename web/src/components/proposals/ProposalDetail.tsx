"use client";

import { useAccount } from "wagmi";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "@/components/entity/TipButton";
import { VotePanel } from "./VotePanel";
import { PredictionMarket } from "./PredictionMarket";
import { computeEntityHash } from "@/lib/entity";
import {
  type Proposal,
  type NounsVote,
  getTimeRemaining,
  getVotePercentage,
} from "@/lib/governance";
import Link from "next/link";
import { useState } from "react";

interface ProposalDetailProps {
  proposal: Proposal & { onchainVotes?: NounsVote[] };
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[#31F387]/10 text-[#31F387] border-[#31F387]/30",
  pending: "bg-yellow-400/10 text-yellow-400 border-yellow-400/30",
  candidate: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  succeeded: "bg-[#2F80ED]/10 text-[#2F80ED] border-[#2F80ED]/30",
  queued: "bg-purple-400/10 text-purple-400 border-purple-400/30",
  executed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  defeated: "bg-[#D0021B]/10 text-[#D0021B] border-[#D0021B]/30",
  closed: "bg-zinc-600/10 text-zinc-400 border-zinc-600/30",
};

export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const { isConnected } = useAccount();
  const proposerHash = computeEntityHash(proposal.proposer);
  const { forPct, againstPct } = getVotePercentage(
    proposal.votesFor,
    proposal.votesAgainst
  );
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [activeTab, setActiveTab] = useState<"description" | "votes">("description");

  const description = proposal.fullBody || proposal.body;
  const isLong = description.length > 500;
  const displayDesc = showFullDesc ? description : description.slice(0, 500);

  const onchainVotes = proposal.onchainVotes || [];
  const forVotes = onchainVotes.filter((v) => v.support === 1);
  const againstVotes = onchainVotes.filter((v) => v.support === 0);
  const abstainVotes = onchainVotes.filter((v) => v.support === 2);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main content */}
      <div className="lg:col-span-2">
        {/* Header */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <img
              src={proposal.daoLogo}
              alt={proposal.dao}
              className="h-8 w-8 rounded-full"
            />
            <span className="text-sm font-medium text-white">{proposal.dao}</span>
            {proposal.proposalNumber != null && (
              <span className="text-sm text-zinc-500">
                Proposal #{proposal.proposalNumber}
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_STYLES[proposal.status] || STATUS_STYLES.closed
              }`}
            >
              {proposal.status === "active"
                ? getTimeRemaining(proposal.endTime)
                : proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
            </span>
            {proposal.isControversial && (
              <span className="rounded-full bg-[#D0021B]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#D0021B]">
                Controversial
              </span>
            )}
          </div>

          <h1 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
            {proposal.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <div className="flex items-center gap-2">
              <span>Proposed by</span>
              <Link href={`/entity/${proposerHash}`}>
                <AddressDisplay
                  address={proposal.proposer}
                  className="text-zinc-300 hover:text-[#2F80ED]"
                />
              </Link>
            </div>
            {isConnected && (
              <TipButton entityHash={proposerHash} />
            )}
            <a
              href={proposal.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[#2F80ED] hover:underline"
            >
              View on {proposal.dao === "Nouns DAO" ? "nouns.wtf" : proposal.source === "parliament" ? "Parliament" : proposal.source === "snapshot" ? "Snapshot" : "source"} &rarr;
            </a>
          </div>
        </div>

        {/* Vote bar — big version */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Current Vote
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#31F387]">
                {proposal.votesFor.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500">For ({forPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#D0021B]">
                {proposal.votesAgainst.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500">Against ({againstPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-400">
                {proposal.votesAbstain.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500">Abstain</p>
            </div>
          </div>

          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bg-[#31F387] transition-all"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-[#D0021B] transition-all"
              style={{ width: `${againstPct}%` }}
            />
          </div>

          {proposal.quorum != null && proposal.quorum > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Quorum: {proposal.quorum.toLocaleString()}
                {proposal.totalSupply
                  ? ` / ${proposal.totalSupply.toLocaleString()} total supply`
                  : ""}
              </span>
              <span>
                {proposal.votesFor >= proposal.quorum ? (
                  <span className="text-[#31F387]">Quorum reached</span>
                ) : (
                  <span>
                    {(proposal.quorum - proposal.votesFor).toLocaleString()} more needed
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Tabs: Description / Votes */}
        <div className="mb-4 flex gap-1 border-b border-zinc-800">
          {(["description", "votes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-[#2F80ED] text-[#2F80ED]"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {tab === "description" ? "Description" : `Votes (${onchainVotes.length})`}
            </button>
          ))}
        </div>

        {activeTab === "description" ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-300">
                {displayDesc}
              </pre>
              {isLong && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="mt-3 text-sm text-[#2F80ED] hover:underline"
                >
                  {showFullDesc ? "Show less" : "Read full description..."}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {onchainVotes.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 py-8 text-center text-zinc-500">
                No individual vote data available for this proposal.
              </div>
            ) : (
              <>
                {/* Vote summary groups */}
                {[
                  { label: "For", votes: forVotes, color: "text-[#31F387]", borderColor: "border-[#31F387]/20" },
                  { label: "Against", votes: againstVotes, color: "text-[#D0021B]", borderColor: "border-[#D0021B]/20" },
                  { label: "Abstain", votes: abstainVotes, color: "text-zinc-400", borderColor: "border-zinc-700" },
                ].map(({ label, votes: groupVotes, color, borderColor }) =>
                  groupVotes.length > 0 ? (
                    <div
                      key={label}
                      className={`rounded-xl border ${borderColor} bg-zinc-900/50 p-4`}
                    >
                      <h3 className={`mb-3 text-sm font-semibold ${color}`}>
                        {label} ({groupVotes.length})
                      </h3>
                      <div className="space-y-2">
                        {groupVotes.slice(0, 20).map((v) => (
                          <div
                            key={v.voter}
                            className="flex items-start gap-3 text-sm"
                          >
                            <Link href={`/entity/${computeEntityHash(v.voter)}`}>
                              <AddressDisplay
                                address={v.voter}
                                className="shrink-0 text-zinc-300 hover:text-[#2F80ED]"
                              />
                            </Link>
                            {v.votes > 1 && (
                              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                                {v.votes} votes
                              </span>
                            )}
                            {v.reason && (
                              <span className="text-zinc-500 line-clamp-2">
                                &ldquo;{v.reason}&rdquo;
                              </span>
                            )}
                          </div>
                        ))}
                        {groupVotes.length > 20 && (
                          <p className="text-xs text-zinc-500">
                            +{groupVotes.length - 20} more
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Prediction market */}
        <PredictionMarket proposal={proposal} />

        {/* Signal vote panel */}
        <VotePanel proposal={proposal} />

        {/* Proposal metadata */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Details
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">DAO</dt>
              <dd className="text-white">{proposal.dao}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Source</dt>
              <dd className="text-white capitalize">{proposal.source}</dd>
            </div>
            {proposal.chain && (
              <div>
                <dt className="text-zinc-500">Chain</dt>
                <dd className="text-white capitalize">{proposal.chain}</dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500">Start</dt>
              <dd className="text-white">
                {proposal.startTime > 0
                  ? new Date(proposal.startTime * 1000).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">End</dt>
              <dd className="text-white">
                {proposal.endTime > 0
                  ? new Date(proposal.endTime * 1000).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            {proposal.executionETA != null && proposal.executionETA > 0 && (
              <div>
                <dt className="text-zinc-500">Execution ETA</dt>
                <dd className="text-white">
                  {new Date(proposal.executionETA * 1000).toLocaleDateString()}
                </dd>
              </div>
            )}
            {proposal.targets && proposal.targets.length > 0 && (
              <div>
                <dt className="text-zinc-500">
                  Targets ({proposal.targets.length})
                </dt>
                <dd className="space-y-1">
                  {proposal.targets.slice(0, 3).map((t, i) => (
                    <AddressDisplay
                      key={i}
                      address={t}
                      className="block text-zinc-400"
                    />
                  ))}
                  {proposal.targets.length > 3 && (
                    <span className="text-xs text-zinc-500">
                      +{proposal.targets.length - 3} more
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
