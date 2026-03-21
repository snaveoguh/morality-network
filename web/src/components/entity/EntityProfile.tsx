"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useReadContract } from "wagmi";
import { isAddress } from "viem";
import {
  CONTRACTS,
  CONTRACTS_CHAIN_ID,
  REGISTRY_ABI,
  TIPPING_ABI,
  LEADERBOARD_ABI,
} from "@/lib/contracts";
import { EntityBadge } from "@/components/shared/EntityBadge";
import { RatingWidget } from "./RatingWidget";
import { CommentThread } from "./CommentThread";
import { TipButton } from "./TipButton";
import { formatEth } from "@/lib/entity";
import { useAccount } from "wagmi";
import {
  getStumbleContext,
  saveStumbleContext,
  type StumbleContextEntry,
} from "@/lib/stumble-context";

interface EntityProfileProps {
  entityHash: `0x${string}`;
}

export function EntityProfile({ entityHash }: EntityProfileProps) {
  const { isConnected } = useAccount();
  const searchParams = useSearchParams();
  const [stumbleContext, setStumbleContext] = useState<StumbleContextEntry | null>(null);

  const { data: entity } = useReadContract({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "getEntity",
    args: [entityHash],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const { data: tipTotal } = useReadContract({
    address: CONTRACTS.tipping,
    abi: TIPPING_ABI,
    functionName: "entityTipTotals",
    args: [entityHash],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const { data: compositeScore } = useReadContract({
    address: CONTRACTS.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: "getCompositeScore",
    args: [entityHash],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const { data: aiScore } = useReadContract({
    address: CONTRACTS.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: "aiScores",
    args: [entityHash],
    chainId: CONTRACTS_CHAIN_ID,
  });

  useEffect(() => {
    const url = searchParams.get("url")?.trim() || "";
    const title = searchParams.get("title")?.trim() || "";
    const source = searchParams.get("source")?.trim() || "";
    const type = searchParams.get("type")?.trim() || "link";
    const description = searchParams.get("description")?.trim() || "";

    if (url || title || source || description) {
      const entry: StumbleContextEntry = {
        hash: entityHash,
        url: url || undefined,
        title: title || url,
        source: source || "stumble",
        type,
        description: description || undefined,
        savedAt: new Date().toISOString(),
      };
      if (url) {
        saveStumbleContext(entry);
      }
      setStumbleContext(entry);
      return;
    }

    setStumbleContext(getStumbleContext(entityHash));
  }, [entityHash, searchParams]);

  const resolvedIdentifier = entity?.identifier || stumbleContext?.url || entityHash;
  const resolvedTitle = stumbleContext?.title || entity?.identifier || entityHash;
  const hasContext = !!(entity?.identifier || stumbleContext);
  const directTipAddress =
    typeof entity?.identifier === "string" && isAddress(entity.identifier.trim())
      ? (entity.identifier.trim() as `0x${string}`)
      : null;

  // Broadcast context to extension
  useEffect(() => {
    window.postMessage({
      type: 'POOTER_SITE_CONTEXT',
      payload: {
        entityHash,
        identifier: resolvedIdentifier,
        title: resolvedTitle,
      },
    }, '*');
  }, [entityHash, resolvedIdentifier, resolvedTitle]);

  return (
    <div className="mx-auto max-w-3xl py-6">
      {/* ── Entity Header ── */}
      <div className="border-b-2 border-[var(--rule)] pb-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {entity && <EntityBadge entityType={entity.entityType} />}
              {stumbleContext?.type && !entity && (
                <span className="border border-[var(--rule)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-light)]">
                  {stumbleContext.type}
                </span>
              )}
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">Entity Profile</span>
            </div>

            {/* Title — show human-readable name when available */}
            {hasContext && resolvedTitle !== entityHash ? (
              <>
                <h1 className="font-headline text-xl leading-tight text-[var(--ink)] sm:text-2xl">
                  {resolvedTitle}
                </h1>
                {stumbleContext?.source && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {stumbleContext.source}
                    {stumbleContext.type && stumbleContext.type !== "link" && (
                      <> &middot; {stumbleContext.type}</>
                    )}
                  </p>
                )}
                {stumbleContext?.description && (
                  <p className="mt-1.5 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                    {stumbleContext.description}
                  </p>
                )}
                {/* Original URL — clickable if it's a real URL */}
                {stumbleContext?.url && /^https?:\/\//.test(stumbleContext.url) && (
                  <a
                    href={stumbleContext.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 block truncate font-mono text-[9px] text-[var(--ink-faint)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
                  >
                    {stumbleContext.url}
                  </a>
                )}
                {/* Entity identifier from registry */}
                {entity?.identifier && (
                  <p className="mt-1 truncate font-mono text-[10px] text-[var(--ink-light)]">
                    {entity.identifier}
                  </p>
                )}
              </>
            ) : (
              <h1 className="break-all font-mono text-sm font-bold text-[var(--ink)]">
                {resolvedIdentifier}
              </h1>
            )}

            {/* Always show the entity hash */}
            <p className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">
              <span className="uppercase tracking-wider">Hash</span>{" "}
              <span className="break-all select-all">{entityHash}</span>
            </p>

            {entity?.claimedOwner &&
              entity.claimedOwner !== "0x0000000000000000000000000000000000000000" && (
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-faint)]">
                  Verified owner:{" "}
                  <span className="font-bold text-[var(--ink)]">{entity.claimedOwner}</span>
                </p>
              )}
          </div>
          {isConnected &&
            (directTipAddress ? (
              <TipButton recipientAddress={directTipAddress} />
            ) : (
              <TipButton entityHash={entityHash} />
            ))}
        </div>

        {/* ── Stats row — compact monospace ── */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--rule-light)] pt-3 font-mono text-[10px] uppercase tracking-wider">
          <StatItem label="Score" value={compositeScore ? (Number(compositeScore) / 100).toFixed(1) : "\u2014"} />
          <span className="text-[var(--rule-light)]">|</span>
          <StatItem label="AI" value={aiScore ? (Number(aiScore) / 100).toFixed(1) : "\u2014"} />
          <span className="text-[var(--rule-light)]">|</span>
          <StatItem label="Tips" value={tipTotal ? formatEth(tipTotal) : "0 ETH"} />
        </div>

        {/* ── Rating ── */}
        <div className="mt-3 border-t border-[var(--rule-light)] pt-3">
          <RatingWidget entityHash={entityHash} />
        </div>
      </div>

      {/* ── Discussion ── */}
      <CommentThread entityHash={entityHash} />
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--ink-faint)]">{label}</span>
      <span className="font-bold text-[var(--ink)]">{value}</span>
    </div>
  );
}
