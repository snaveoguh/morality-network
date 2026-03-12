"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "@/components/entity/TipButton";
import { computeEntityHash } from "@/lib/entity";
import { CommentThread } from "@/components/entity/CommentThread";
import type { CandidateProposal } from "@/lib/nouns-candidates";
import { SponsorPanel } from "./SponsorPanel";
import { PromoteButton } from "./PromoteButton";
import { isAddress } from "viem";

interface CandidateDetailProps {
  candidate: CandidateProposal;
}

// ── Extract first image URL from markdown body ──
function extractImageFromBody(body: string): string | null {
  const mdMatch = body.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  const htmlMatch = body.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/);
  if (htmlMatch) return htmlMatch[1];
  const urlMatch = body.match(
    /(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg))/i
  );
  if (urlMatch) return urlMatch[1];
  return null;
}

export function CandidateDetail({ candidate }: CandidateDetailProps) {
  const { isConnected } = useAccount();
  const proposer = candidate.proposer.trim();
  const hasProposerAddress = isAddress(proposer);
  const proposerHash = computeEntityHash(proposer);
  const [activeTab, setActiveTab] = useState<"description" | "sponsors">(
    "description"
  );
  const [showFullDesc, setShowFullDesc] = useState(false);

  const sponsorPct =
    candidate.requiredThreshold > 0
      ? Math.min(
          100,
          Math.round(
            (candidate.signatureCount / candidate.requiredThreshold) * 100
          )
        )
      : 0;

  const description = candidate.description || "";
  const isLong = description.length > 800;
  const displayDesc = showFullDesc ? description : description.slice(0, 800);

  const heroImage = useMemo(
    () => extractImageFromBody(description),
    [description]
  );

  // Entity identifier for comment thread
  const candidateEntityId = `nouns-candidate:${candidate.slug}`;
  const candidateEntityHash = computeEntityHash(candidateEntityId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      {/* ══ MAIN COLUMN ══ */}
      <div className="min-w-0">
        {/* ── Header line ── */}
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <img
            src="https://noun.pics/1"
            alt=""
            className="newspaper-img h-5 w-5 rounded-full"
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Nouns DAO
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            &middot; Candidate
          </span>
          {candidate.isPromotable && (
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--ink)]">
              Ready to Promote
            </span>
          )}
        </div>

        {/* ── Headline ── */}
        <h1 className="font-headline text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
          {candidate.title}
        </h1>

        {/* ── Byline ── */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-[var(--rule-light)] pb-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
            <span>Proposed by</span>
            <Link href={`/entity/${proposerHash}`}>
              <AddressDisplay
                address={proposer}
                className="text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
              />
            </Link>
          </div>
          {isConnected && hasProposerAddress && (
            <TipButton recipientAddress={proposer} />
          )}
          <a
            href={`https://nouns.wtf/candidates/${encodeURIComponent(candidate.slug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            View on nouns.wtf &rsaquo;
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

        {/* ── Sponsor progress ── */}
        <div className="mt-5 border-b border-t border-[var(--rule)] py-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Sponsor Progress
          </h2>

          {/* Tally text */}
          <div className="mb-3 flex items-baseline gap-6">
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {candidate.signatureCount}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Sponsors
              </span>
            </div>
            <span className="font-headline text-lg text-[var(--ink-faint)]">
              &mdash;
            </span>
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {candidate.requiredThreshold}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Required
              </span>
            </div>
            <span className="font-headline text-lg text-[var(--ink-faint)]">
              &mdash;
            </span>
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {sponsorPct}%
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Complete
              </span>
            </div>
          </div>

          {/* Monochrome progress bar */}
          <div className="flex h-1.5 overflow-hidden bg-[var(--paper-dark)]">
            <div
              className="bg-[var(--ink)] transition-all"
              style={{ width: `${sponsorPct}%` }}
            />
          </div>

          {/* Status text */}
          <div className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">
            {candidate.isPromotable ? (
              <span className="font-bold text-[var(--ink)]">
                Threshold reached &mdash; ready to promote
              </span>
            ) : (
              <span>
                {candidate.requiredThreshold - candidate.signatureCount} more
                sponsor
                {candidate.requiredThreshold - candidate.signatureCount !== 1
                  ? "s"
                  : ""}{" "}
                needed to promote
              </span>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="mt-4 flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
          {(["description", "sponsors"] as const).map((tab, i) => (
            <span key={tab} className="flex items-center">
              {i > 0 && (
                <span className="mx-2 text-[var(--rule-light)]">|</span>
              )}
              <button
                onClick={() => setActiveTab(tab)}
                className={`transition-colors ${
                  activeTab === tab
                    ? "font-bold text-[var(--ink)] underline underline-offset-4"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {tab === "description"
                  ? "Description"
                  : `Sponsors (${candidate.signatureCount})`}
              </button>
            </span>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="mt-4">
          {activeTab === "description" ? (
            <div>
              <div className="font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {displayDesc}
                </div>
              </div>
              {isLong && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                >
                  {showFullDesc
                    ? "Show less \u25B2"
                    : "Read full description \u25BC"}
                </button>
              )}
            </div>
          ) : (
            <div>
              {candidate.sponsorSignatures.length === 0 ? (
                <p className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  No sponsors yet. Be the first to sponsor this candidate.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {candidate.sponsorSignatures.map((sig, i) => (
                    <div
                      key={`${sig.signer}-${i}`}
                      className="flex items-start gap-2 border-b border-[var(--rule-light)] pb-2 text-[11px] last:border-0 last:pb-0"
                    >
                      <Link
                        href={`/entity/${computeEntityHash(sig.signer)}`}
                      >
                        <AddressDisplay
                          address={sig.signer}
                          className="shrink-0 font-mono text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
                        />
                      </Link>
                      {sig.reason && (
                        <span className="line-clamp-2 font-body-serif italic text-[var(--ink-faint)]">
                          &ldquo;{sig.reason}&rdquo;
                        </span>
                      )}
                      {sig.expirationTimestamp > 0 && (
                        <span className="ml-auto shrink-0 font-mono text-[8px] text-[var(--ink-faint)]">
                          Exp.{" "}
                          {new Date(
                            sig.expirationTimestamp * 1000
                          ).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Discussion ── */}
        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Discussion
          </h2>
          <CommentThread entityHash={candidateEntityHash} compact />
        </div>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div className="space-y-5">
        {/* Sponsor panel — sign to back this candidate */}
        <SponsorPanel candidate={candidate} />

        {/* Promote button — create the real proposal */}
        {candidate.isPromotable && <PromoteButton candidate={candidate} />}

        {/* Candidate metadata */}
        <div className="border-t border-[var(--rule)] pt-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Details
          </h3>
          <dl className="space-y-2">
            {[
              ["DAO", "Nouns DAO"],
              ["Type", "Candidate Proposal"],
              ["Chain", "Ethereum Mainnet"],
              ["Slug", candidate.slug],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between"
              >
                <dt className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {label}
                </dt>
                <dd className="max-w-[160px] truncate font-body-serif text-xs text-[var(--ink)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Targets */}
          {candidate.targets && candidate.targets.length > 0 && (
            <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Targets ({candidate.targets.length})
              </p>
              <div className="space-y-0.5">
                {candidate.targets.slice(0, 3).map((t, i) => (
                  <AddressDisplay
                    key={i}
                    address={t}
                    className="block font-mono text-[10px] text-[var(--ink-light)]"
                  />
                ))}
                {candidate.targets.length > 3 && (
                  <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                    +{candidate.targets.length - 3} more
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
