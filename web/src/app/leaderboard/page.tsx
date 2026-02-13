"use client";

import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { EntityType } from "@/lib/contracts";

// Placeholder data — in production this comes from the indexer/subgraph
const PLACEHOLDER_ENTRIES = [
  {
    rank: 1,
    entityHash: "0xabc123",
    identifier: "reuters.com",
    entityType: EntityType.DOMAIN,
    avgRating: 4.2,
    ratingCount: 156,
    tipTotal: "0.85 ETH",
    commentCount: 89,
    aiScore: 92,
    compositeScore: 87.4,
  },
  {
    rank: 2,
    entityHash: "0xdef456",
    identifier: "bbc.co.uk",
    entityType: EntityType.DOMAIN,
    avgRating: 4.0,
    ratingCount: 134,
    tipTotal: "0.62 ETH",
    commentCount: 72,
    aiScore: 89,
    compositeScore: 82.1,
  },
  {
    rank: 3,
    entityHash: "0x789abc",
    identifier: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    entityType: EntityType.ADDRESS,
    avgRating: 4.8,
    ratingCount: 312,
    tipTotal: "2.1 ETH",
    commentCount: 201,
    aiScore: 95,
    compositeScore: 94.2,
  },
  {
    rank: 4,
    entityHash: "0x456def",
    identifier: "techcrunch.com",
    entityType: EntityType.DOMAIN,
    avgRating: 3.8,
    ratingCount: 98,
    tipTotal: "0.34 ETH",
    commentCount: 45,
    aiScore: 78,
    compositeScore: 71.5,
  },
  {
    rank: 5,
    entityHash: "0xcde789",
    identifier: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    entityType: EntityType.CONTRACT,
    avgRating: 4.5,
    ratingCount: 89,
    tipTotal: "0.55 ETH",
    commentCount: 67,
    aiScore: 88,
    compositeScore: 79.8,
  },
];

export default function LeaderboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
        <p className="mt-2 text-zinc-400">
          Universal reputation rankings — domains, addresses, contracts, and
          content scored by community ratings, AI analysis, tips, and engagement.
        </p>
      </div>

      {/* Scoring explanation */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-300">Composite Score</span> ={" "}
          <span className="text-yellow-400">Rating (40%)</span> +{" "}
          <span className="text-[#2F80ED]">AI Score (30%)</span> +{" "}
          <span className="text-[#31F387]">Tips (20%)</span> +{" "}
          <span className="text-purple-400">Engagement (10%)</span>
        </p>
      </div>

      <LeaderboardTable entries={PLACEHOLDER_ENTRIES} />
    </div>
  );
}
