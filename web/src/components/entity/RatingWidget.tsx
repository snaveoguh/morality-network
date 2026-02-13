"use client";

import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { CONTRACTS, RATINGS_ABI } from "@/lib/contracts";
import { StarRating } from "@/components/shared/StarRating";

interface RatingWidgetProps {
  entityHash: `0x${string}`;
}

export function RatingWidget({ entityHash }: RatingWidgetProps) {
  const { address, isConnected } = useAccount();

  const { data: avgData } = useReadContract({
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: "getAverageRating",
    args: [entityHash],
  });

  const { data: userRatingData } = useReadContract({
    address: CONTRACTS.ratings,
    abi: RATINGS_ABI,
    functionName: "getUserRating",
    args: [entityHash, address!],
    query: { enabled: !!address },
  });

  const { writeContract, isPending } = useWriteContract();

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
      {/* Average rating display */}
      <div className="flex items-center gap-2">
        <StarRating rating={avgRating} size="sm" count={ratingCount} />
        <span className="text-sm font-medium text-zinc-300">
          {avgRating > 0 ? avgRating.toFixed(1) : "—"}
        </span>
      </div>

      {/* User rating (interactive) */}
      {isConnected && (
        <div className="flex items-center gap-2 border-l border-zinc-700 pl-4">
          <span className="text-xs text-zinc-500">Your rating:</span>
          <StarRating
            rating={userScore}
            size="sm"
            interactive
            onRate={handleRate}
          />
          {isPending && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#31F387] border-t-transparent" />
          )}
        </div>
      )}
    </div>
  );
}
