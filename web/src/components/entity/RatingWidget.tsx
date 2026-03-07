"use client";

import { useEffect } from "react";
import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, RATINGS_ABI } from "@/lib/contracts";
import { StarRating } from "@/components/shared/StarRating";

interface RatingWidgetProps {
  entityHash: `0x${string}`;
}

export function RatingWidget({ entityHash }: RatingWidgetProps) {
  const { address, isConnected } = useAccount();

  const { data: avgData, refetch: refetchAverage } = useReadContract({
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: "getAverageRating",
    args: [entityHash],
  });

  const { data: userRatingData, refetch: refetchUserRating } = useReadContract({
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: "getUserRating",
    args: [entityHash, address!],
    query: { enabled: !!address },
  });

  const { writeContract, data: ratingTxHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: ratingTxHash,
      query: { enabled: !!ratingTxHash },
    });

  useEffect(() => {
    if (!isConfirmed) return;
    void refetchAverage();
    if (address) {
      void refetchUserRating();
    }
  }, [isConfirmed, address, refetchAverage, refetchUserRating]);

  const avgRating = avgData ? Number(avgData[0]) / 100 : 0;
  const ratingCount = avgData ? Number(avgData[1]) : 0;
  const userScore = userRatingData ? Number(userRatingData[0]) : 0;

  function handleRate(score: number) {
    if (!isConnected) return;
    writeContract({
      address: CONTRACTS.ratings,
      abi: RATINGS_ABI,
      functionName: "rate",
      args: [entityHash, score],
    });
  }

  return (
    <div className="flex items-center gap-4">
      {/* Average rating */}
      <div className="flex items-center gap-2">
        <StarRating rating={avgRating} size="sm" count={ratingCount} />
        <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
          {avgRating > 0 ? avgRating.toFixed(1) : "\u2014"}
        </span>
      </div>

      {/* User rating */}
      {isConnected && (
        <div className="flex items-center gap-2 border-l border-[var(--rule-light)] pl-4">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">Your rating:</span>
          <StarRating
            rating={userScore}
            size="sm"
            interactive
            onRate={handleRate}
          />
          {(isPending || isConfirming) && (
            <span className="h-2.5 w-2.5 animate-spin border border-[var(--ink)] border-t-transparent" />
          )}
        </div>
      )}
      {error && (
        <span className="font-mono text-[9px] text-[var(--accent-red)]">
          {(error as { shortMessage?: string }).shortMessage || error.message}
        </span>
      )}
    </div>
  );
}
