"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, REGISTRY_ABI, TIPPING_ABI, LEADERBOARD_ABI } from "@/lib/contracts";
import { EntityBadge } from "@/components/shared/EntityBadge";
import { RatingWidget } from "./RatingWidget";
import { CommentThread } from "./CommentThread";
import { TipButton } from "./TipButton";
import { formatEth } from "@/lib/entity";
import { useAccount } from "wagmi";

interface EntityProfileProps {
  entityHash: `0x${string}`;
}

export function EntityProfile({ entityHash }: EntityProfileProps) {
  const { isConnected } = useAccount();

  const { data: entity } = useReadContract({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "getEntity",
    args: [entityHash],
  });

  const { data: tipTotal } = useReadContract({
    address: CONTRACTS.tipping,
    abi: TIPPING_ABI,
    functionName: "entityTipTotals",
    args: [entityHash],
  });

  const { data: compositeScore } = useReadContract({
    address: CONTRACTS.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: "getCompositeScore",
    args: [entityHash],
  });

  const { data: aiScore } = useReadContract({
    address: CONTRACTS.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: "aiScores",
    args: [entityHash],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            {entity && <EntityBadge entityType={entity.entityType} />}
            <h1 className="mt-2 break-all text-xl font-bold text-white">
              {entity?.identifier || entityHash}
            </h1>
            {entity?.claimedOwner &&
              entity.claimedOwner !==
                "0x0000000000000000000000000000000000000000" && (
                <p className="mt-1 text-sm text-zinc-400">
                  Verified owner:{" "}
                  <span className="font-mono text-[#31F387]">
                    {entity.claimedOwner}
                  </span>
                </p>
              )}
          </div>

          {isConnected && <TipButton entityHash={entityHash} />}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Composite Score"
            value={
              compositeScore
                ? (Number(compositeScore) / 100).toFixed(1)
                : "—"
            }
          />
          <StatCard
            label="AI Score"
            value={
              aiScore ? (Number(aiScore) / 100).toFixed(1) : "—"
            }
          />
          <StatCard
            label="Total Tips"
            value={tipTotal ? formatEth(tipTotal) : "0 ETH"}
          />
          <StatCard
            label="Entity Hash"
            value={`${entityHash.slice(0, 10)}...`}
            mono
          />
        </div>

        {/* Rating */}
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <RatingWidget entityHash={entityHash} />
        </div>
      </div>

      {/* Comments */}
      <CommentThread entityHash={entityHash} />
    </div>
  );
}

function StatCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold text-white ${mono ? "font-mono text-sm" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
