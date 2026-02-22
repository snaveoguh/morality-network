"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "@/components/entity/TipButton";
import { computeEntityHash } from "@/lib/entity";
import type { CandidateProposal } from "@/lib/nouns-candidates";
import { SponsorPanel } from "./SponsorPanel";
import { PromoteButton } from "./PromoteButton";

interface CandidateDetailProps {
  candidate: CandidateProposal;
}

export function CandidateDetail({ candidate }: CandidateDetailProps) {
  const { isConnected } = useAccount();
  const proposerHash = computeEntityHash(candidate.proposer);
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
  const isLong = description.length > 500;
  const displayDesc = showFullDesc ? description : description.slice(0, 500);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main content */}
      <div className="lg:col-span-2">
        {/* Header */}
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <img
              src="https://noun.pics/1"
              alt="Nouns DAO"
              className="h-8 w-8 rounded-full"
            />
            <span className="text-sm font-medium text-white">Nouns DAO</span>
            <span className="rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-400">
              Candidate Proposal
            </span>
            {candidate.isPromotable && (
              <span className="rounded-full border border-[#31F387]/30 bg-[#31F387]/10 px-3 py-1 text-xs font-bold text-[#31F387]">
                Ready to Promote
              </span>
            )}
          </div>

          <h1 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
            {candidate.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <div className="flex items-center gap-2">
              <span>Proposed by</span>
              <Link href={`/entity/${proposerHash}`}>
                <AddressDisplay
                  address={candidate.proposer}
                  className="text-zinc-300 hover:text-[#2F80ED]"
                />
              </Link>
            </div>
            {isConnected && <TipButton entityHash={proposerHash} />}
            <a
              href={`https://nouns.wtf/candidates/${encodeURIComponent(candidate.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[#2F80ED] hover:underline"
            >
              View on nouns.wtf &rarr;
            </a>
          </div>
        </div>

        {/* Sponsor progress bar — big version */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Sponsor Progress
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-amber-400">
                {candidate.signatureCount}
              </p>
              <p className="text-xs text-zinc-500">Sponsors</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-400">
                {candidate.requiredThreshold}
              </p>
              <p className="text-xs text-zinc-500">Required</p>
            </div>
            <div>
              <p
                className={`text-2xl font-bold ${candidate.isPromotable ? "text-[#31F387]" : "text-zinc-400"}`}
              >
                {sponsorPct}%
              </p>
              <p className="text-xs text-zinc-500">Complete</p>
            </div>
          </div>

          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`transition-all ${candidate.isPromotable ? "bg-[#31F387]" : "bg-amber-400"}`}
              style={{ width: `${sponsorPct}%` }}
            />
          </div>

          {candidate.isPromotable ? (
            <p className="mt-3 text-center text-sm font-medium text-[#31F387]">
              This candidate has enough sponsors and can be promoted to an
              official proposal!
            </p>
          ) : (
            <p className="mt-3 text-center text-xs text-zinc-500">
              {candidate.requiredThreshold - candidate.signatureCount} more
              sponsor{candidate.requiredThreshold - candidate.signatureCount !== 1 ? "s" : ""}{" "}
              needed to promote
            </p>
          )}
        </div>

        {/* Tabs: Description / Sponsors */}
        <div className="mb-4 flex gap-1 border-b border-zinc-800">
          {(["description", "sponsors"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {tab === "description"
                ? "Description"
                : `Sponsors (${candidate.signatureCount})`}
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
            {candidate.sponsorSignatures.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 py-8 text-center text-zinc-500">
                No sponsors yet. Be the first to sponsor this candidate!
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/20 bg-zinc-900/50 p-4">
                <div className="space-y-3">
                  {candidate.sponsorSignatures.map((sig, i) => (
                    <div
                      key={`${sig.signer}-${i}`}
                      className="flex items-start gap-3 border-b border-zinc-800 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex-1">
                        <Link href={`/entity/${computeEntityHash(sig.signer)}`}>
                          <AddressDisplay
                            address={sig.signer}
                            className="font-medium text-zinc-300 hover:text-[#2F80ED]"
                          />
                        </Link>
                        {sig.reason && (
                          <p className="mt-1 text-xs text-zinc-500">
                            &ldquo;{sig.reason}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-[10px] text-zinc-600">
                        {sig.expirationTimestamp > 0 && (
                          <span>
                            Expires{" "}
                            {new Date(
                              sig.expirationTimestamp * 1000
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Sponsor panel — sign to back this candidate */}
        <SponsorPanel candidate={candidate} />

        {/* Promote button — create the real proposal */}
        {candidate.isPromotable && (
          <PromoteButton candidate={candidate} />
        )}

        {/* Candidate metadata */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Details
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">DAO</dt>
              <dd className="text-white">Nouns DAO</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Type</dt>
              <dd className="text-amber-400">Candidate Proposal</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Chain</dt>
              <dd className="text-white">Ethereum Mainnet</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Slug</dt>
              <dd className="truncate text-white">{candidate.slug}</dd>
            </div>
            {candidate.targets && candidate.targets.length > 0 && (
              <div>
                <dt className="text-zinc-500">
                  Targets ({candidate.targets.length})
                </dt>
                <dd className="space-y-1">
                  {candidate.targets.slice(0, 3).map((t, i) => (
                    <AddressDisplay
                      key={i}
                      address={t}
                      className="block text-zinc-400"
                    />
                  ))}
                  {candidate.targets.length > 3 && (
                    <span className="text-xs text-zinc-500">
                      +{candidate.targets.length - 3} more
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
