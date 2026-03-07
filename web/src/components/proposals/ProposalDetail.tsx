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
import { useState, useMemo } from "react";

interface ProposalDetailProps {
  proposal: Proposal & { onchainVotes?: NounsVote[] };
}

// ── Extract first image URL from markdown body ──
function extractImageFromBody(body: string): string | null {
  // Markdown image: ![alt](url)
  const mdMatch = body.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  // HTML img tag: <img src="url"
  const htmlMatch = body.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/);
  if (htmlMatch) return htmlMatch[1];
  // Raw URL to known image hosts
  const urlMatch = body.match(/(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg))/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

const SOURCE_LABELS: Record<string, string> = {
  snapshot: "Snapshot",
  onchain: "Onchain",
  tally: "Tally",
  parliament: "Parliament",
  congress: "Congress",
  eu: "European Parliament",
  canada: "House of Commons",
  australia: "Parliament",
  sec: "SEC EDGAR",
};

const SOURCE_FLAGS: Record<string, string> = {
  parliament: "🇬🇧",
  congress: "🇺🇸",
  eu: "🇪🇺",
  canada: "🇨🇦",
  australia: "🇦🇺",
  sec: "📊",
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
  const isLong = description.length > 800;
  const displayDesc = showFullDesc ? description : description.slice(0, 800);

  const onchainVotes = proposal.onchainVotes || [];
  const forVotes = onchainVotes.filter((v) => v.support === 1);
  const againstVotes = onchainVotes.filter((v) => v.support === 0);
  const abstainVotes = onchainVotes.filter((v) => v.support === 2);

  const heroImage = useMemo(() => extractImageFromBody(description), [description]);

  const isActive = proposal.status === "active";
  const flag = SOURCE_FLAGS[proposal.source] || "";
  const sourceLabel = SOURCE_LABELS[proposal.source] || proposal.source;

  const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
  const isParliamentary = ["parliament", "congress", "canada", "australia"].includes(proposal.source);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      {/* ══ MAIN COLUMN ══ */}
      <div className="min-w-0">
        {/* ── Header line ── */}
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {proposal.daoLogo && (
            <img
              src={proposal.daoLogo}
              alt=""
              className="newspaper-img h-5 w-5 rounded-full"
            />
          )}
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            {flag} {proposal.dao}
          </span>
          {proposal.proposalNumber != null && (
            <span className="font-mono text-[10px] text-[var(--ink-faint)]">
              &middot; Proposal #{proposal.proposalNumber}
            </span>
          )}
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
              isActive ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
            }`}
          >
            &middot; {isActive ? getTimeRemaining(proposal.endTime) : proposal.status}
          </span>
          {proposal.isControversial && (
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--accent-red)]">
              Controversial
            </span>
          )}
        </div>

        {/* ── Headline ── */}
        <h1 className="font-headline text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
          {proposal.title}
        </h1>

        {/* ── Byline ── */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-[var(--rule-light)] pb-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
            <span>Proposed by</span>
            <Link href={`/entity/${proposerHash}`}>
              <AddressDisplay
                address={proposal.proposer}
                className="text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
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
            className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            View on {sourceLabel} &rsaquo;
          </a>
        </div>

        {/* ── Hero image (extracted from body) ── */}
        {heroImage && (
          <div className="newspaper-img-hero mt-4">
            <img
              src={heroImage}
              alt=""
              className="newspaper-img w-full"
              loading="lazy"
            />
            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              Image from proposal body
            </p>
          </div>
        )}

        {/* ── Vote tally ── */}
        <div className="mt-5 border-b border-t border-[var(--rule)] py-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Current Vote
          </h2>

          {/* Tally text */}
          <div className="mb-3 flex items-baseline gap-6">
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {proposal.votesFor.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {isParliamentary ? "Ayes" : "For"} ({forPct}%)
              </span>
            </div>
            <span className="font-headline text-lg text-[var(--ink-faint)]">&mdash;</span>
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {proposal.votesAgainst.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                {isParliamentary ? "Noes" : "Against"} ({againstPct}%)
              </span>
            </div>
            {proposal.votesAbstain > 0 && (
              <>
                <span className="font-headline text-lg text-[var(--ink-faint)]">&mdash;</span>
                <div>
                  <span className="font-headline text-2xl font-black text-[var(--ink-faint)]">
                    {proposal.votesAbstain.toLocaleString()}
                  </span>
                  <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Abstain
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Monochrome vote bar */}
          <div className="flex h-1.5 overflow-hidden bg-[var(--paper-dark)]">
            <div
              className="bg-[var(--ink)] transition-all"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-[var(--rule-light)] transition-all"
              style={{ width: `${againstPct}%` }}
            />
          </div>

          {/* Quorum */}
          {proposal.quorum != null && proposal.quorum > 0 && (
            <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-[var(--ink-faint)]">
              <span>
                Quorum: {proposal.quorum.toLocaleString()}
                {proposal.totalSupply
                  ? ` / ${proposal.totalSupply.toLocaleString()} total supply`
                  : ""}
              </span>
              <span>
                {proposal.votesFor >= proposal.quorum ? (
                  <span className="font-bold text-[var(--ink)]">Quorum reached</span>
                ) : (
                  <span>
                    {(proposal.quorum - proposal.votesFor).toLocaleString()} more needed
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="mt-4 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
          {(["description", "votes"] as const).map((tab, i) => (
            <span key={tab} className="flex items-center">
              {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
              <button
                onClick={() => setActiveTab(tab)}
                className={`transition-colors ${
                  activeTab === tab
                    ? "font-bold text-[var(--ink)] underline underline-offset-4"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {tab === "description" ? "Description" : `Votes (${onchainVotes.length})`}
              </button>
            </span>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="mt-4">
          {activeTab === "description" ? (
            <div>
              <div className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                <pre className="whitespace-pre-wrap break-words font-[inherit] leading-relaxed">
                  {displayDesc}
                </pre>
              </div>
              {isLong && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                >
                  {showFullDesc ? "Show less \u25B2" : "Read full description \u25BC"}
                </button>
              )}
            </div>
          ) : (
            <div>
              {onchainVotes.length === 0 ? (
                <p className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  No individual vote data available for this proposal.
                </p>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: isParliamentary ? "Ayes" : "For", votes: forVotes },
                    { label: isParliamentary ? "Noes" : "Against", votes: againstVotes },
                    { label: "Abstain", votes: abstainVotes },
                  ].map(({ label, votes: groupVotes }) =>
                    groupVotes.length > 0 ? (
                      <div key={label}>
                        <h3 className="mb-2 border-b border-[var(--rule-light)] pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
                          {label} ({groupVotes.length})
                        </h3>
                        <div className="space-y-1.5">
                          {groupVotes.slice(0, 20).map((v) => (
                            <div
                              key={v.voter}
                              className="flex items-start gap-2 text-[11px]"
                            >
                              <Link href={`/entity/${computeEntityHash(v.voter)}`}>
                                <AddressDisplay
                                  address={v.voter}
                                  className="shrink-0 font-mono text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
                                />
                              </Link>
                              {v.votes > 1 && (
                                <span className="shrink-0 border border-[var(--rule-light)] px-1 py-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
                                  {v.votes} votes
                                </span>
                              )}
                              {v.reason && (
                                <span className="line-clamp-2 font-body-serif italic text-[var(--ink-faint)]">
                                  &ldquo;{v.reason}&rdquo;
                                </span>
                              )}
                            </div>
                          ))}
                          {groupVotes.length > 20 && (
                            <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                              +{groupVotes.length - 20} more
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div className="space-y-5">
        {/* Prediction market */}
        {proposal.source === "onchain" && proposal.status !== "candidate" && (
          <PredictionMarket proposal={proposal} />
        )}

        {/* Signal vote panel */}
        <VotePanel proposal={proposal} />

        {/* Proposal metadata */}
        <div className="border-t border-[var(--rule)] pt-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Details
          </h3>
          <dl className="space-y-2">
            {[
              ["DAO", proposal.dao],
              ["Source", `${flag} ${sourceLabel}`],
              proposal.chain ? ["Chain", proposal.chain] : null,
              [
                "Start",
                proposal.startTime > 0
                  ? new Date(proposal.startTime * 1000).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—",
              ],
              [
                "End",
                proposal.endTime > 0
                  ? new Date(proposal.endTime * 1000).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—",
              ],
              proposal.executionETA != null && proposal.executionETA > 0
                ? [
                    "Execution",
                    new Date(proposal.executionETA * 1000).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    }),
                  ]
                : null,
            ]
              .filter((x): x is [string, string] => x !== null)
              .map(([label, value]) => (
                <div key={label as string} className="flex items-baseline justify-between">
                  <dt className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {label as string}
                  </dt>
                  <dd className="font-body-serif text-xs capitalize text-[var(--ink)]">
                    {value as string}
                  </dd>
                </div>
              ))}
          </dl>

          {/* Targets */}
          {proposal.targets && proposal.targets.length > 0 && (
            <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Targets ({proposal.targets.length})
              </p>
              <div className="space-y-0.5">
                {proposal.targets.slice(0, 3).map((t, i) => (
                  <AddressDisplay
                    key={i}
                    address={t}
                    className="block font-mono text-[10px] text-[var(--ink-light)]"
                  />
                ))}
                {proposal.targets.length > 3 && (
                  <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                    +{proposal.targets.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
