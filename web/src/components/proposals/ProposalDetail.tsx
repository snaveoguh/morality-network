"use client";

import { useAccount } from "wagmi";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "@/components/entity/TipButton";
import { VotePanel } from "./VotePanel";
import { PredictionMarket } from "./PredictionMarket";
import { InterpretationPanel } from "./InterpretationPanel";
import { computeEntityHash } from "@/lib/entity";
import { CommentThread } from "@/components/entity/CommentThread";
import { getDaoPredictionKey, getPrimaryProposalEntityIdentifier } from "@/lib/proposal-entity";
import {
  type Proposal,
  type NounsVote,
  getTimeRemaining,
  getVotePercentage,
  isDelegationActivityProposal,
} from "@/lib/governance";
import Link from "next/link";
import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { isAddress } from "viem";

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
  hyperliquid: "Hyperliquid",
};

const SOURCE_FLAGS: Record<string, string> = {
  parliament: "🇬🇧",
  congress: "🇺🇸",
  eu: "🇪🇺",
  canada: "🇨🇦",
  australia: "🇦🇺",
  sec: "📊",
  hyperliquid: "💧",
};

function VoterWeightMap({ votes }: { votes: NounsVote[] }) {
  if (votes.length === 0) return null;

  const topVotes = [...votes].sort((a, b) => b.votes - a.votes).slice(0, 60);
  const maxVotes = Math.max(...topVotes.map((v) => v.votes), 1);

  return (
    <div className="mt-4 border border-[var(--rule-light)] p-3">
      <h3 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Voter Weight Map
      </h3>
      <div className="flex flex-wrap items-end gap-1.5">
        {topVotes.map((v) => {
          const size = 6 + Math.round((v.votes / maxVotes) * 18);
          const tone =
            v.support === 1
              ? "var(--ink)"
              : v.support === 0
                ? "var(--ink-faint)"
                : "var(--rule-light)";

          return (
            <div
              key={`${v.voter}-${v.support}`}
              title={`${v.voter} • ${v.votes.toLocaleString()} votes`}
              className="rounded-full border border-[var(--rule-light)]"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                background: tone,
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Top {topVotes.length} voters • bubble size = voting power
      </p>
    </div>
  );
}

export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const { isConnected } = useAccount();
  const proposer = proposal.proposer?.trim() || "";
  const hasProposerAddress = isAddress(proposer);
  const proposerHash = hasProposerAddress
    ? computeEntityHash(proposer)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as const);
  const sourceHref =
    typeof proposal.link === "string" && /^https?:\/\//i.test(proposal.link)
      ? proposal.link
      : null;
  const discussionProposalId = Number.isFinite(proposal.proposalNumber)
    ? String(proposal.proposalNumber)
    : proposal.id;
  const proposalDiscussionIdentifier = getPrimaryProposalEntityIdentifier(
    getDaoPredictionKey(proposal.dao),
    discussionProposalId
  );
  const proposalDiscussionHash = computeEntityHash(proposalDiscussionIdentifier);
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
  const isDelegationActivity = isDelegationActivityProposal(proposal);
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
          {isDelegationActivity && (
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink)]">
              Delegation activity
            </span>
          )}
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
          {hasProposerAddress ? (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
              <span>Proposed by</span>
              <Link href={`/entity/${proposerHash}`}>
                <AddressDisplay
                  address={proposer}
                  className="text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
                />
              </Link>
            </div>
          ) : (
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              Source: {sourceLabel}
            </div>
          )}
          {isConnected && hasProposerAddress && (
            <TipButton recipientAddress={proposer} />
          )}
          {sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              View on {sourceLabel} &rsaquo;
            </a>
          ) : (
            <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              Source link unavailable
            </span>
          )}
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

        {/* ── Vote tally / activity ── */}
        <div className="mt-5 border-b border-t border-[var(--rule)] py-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {isDelegationActivity ? "Delegation Activity" : "Current Vote"}
          </h2>

          {isDelegationActivity ? (
            <p className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
              This record is an onchain delegate change, not a proposal vote. It
              shows who moved their voting power and links to the transaction that
              recorded the change.
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="mt-4 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
          {(["description", "votes"] as const)
            .filter((tab) => !isDelegationActivity || tab === "description")
            .map((tab, i) => (
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
              <div className="proposal-markdown font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                <ReactMarkdown
                  components={{
                    img: ({ src, alt }) => (
                      <img
                        src={src}
                        alt={alt || ""}
                        className="newspaper-img my-4 w-full max-w-2xl"
                        loading="lazy"
                      />
                    ),
                    h1: ({ children }) => (
                      <h1 className="mb-3 mt-6 font-headline text-2xl text-[var(--ink)]">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-2 mt-5 font-headline text-xl text-[var(--ink)]">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-2 mt-4 font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 leading-relaxed">{children}</p>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-2 hover:decoration-[var(--ink)]"
                      >
                        {children}
                      </a>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 border-l-2 border-[var(--rule)] pl-4 italic text-[var(--ink-faint)]">
                        {children}
                      </blockquote>
                    ),
                    code: ({ children }) => (
                      <code className="bg-[var(--paper-dark)] px-1 py-0.5 font-mono text-xs">{children}</code>
                    ),
                    pre: ({ children }) => (
                      <pre className="my-3 overflow-x-auto bg-[var(--paper-dark)] p-3 font-mono text-xs">{children}</pre>
                    ),
                    hr: () => (
                      <hr className="my-4 border-[var(--rule-light)]" />
                    ),
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto">
                        <table className="min-w-full border-collapse border border-[var(--rule-light)] text-xs">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border border-[var(--rule-light)] bg-[var(--paper-dark)] px-2 py-1 text-left font-mono text-[9px] uppercase tracking-wider">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-[var(--rule-light)] px-2 py-1">{children}</td>
                    ),
                  }}
                >
                  {displayDesc}
                </ReactMarkdown>
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
                  <VoterWeightMap votes={onchainVotes} />
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

        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Interpretation Thread
          </h2>
          <CommentThread entityHash={proposalDiscussionHash} compact />
        </div>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div className="space-y-5">
        <InterpretationPanel proposal={proposal} />

        {/* Prediction market */}
        {proposal.dao === "Nouns DAO" &&
          proposal.source === "onchain" &&
          proposal.status !== "candidate" &&
          !isDelegationActivity && (
          <PredictionMarket proposal={proposal} />
        )}

        {/* Signal vote panel */}
        {!isDelegationActivity && <VotePanel proposal={proposal} />}

        {/* Proposal metadata */}
        <div className="border-t border-[var(--rule)] pt-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Details
          </h3>
          <dl className="space-y-2">
            {[
              ["ID", proposal.id],
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
