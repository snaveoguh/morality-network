import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { computeEntityHash } from "@/lib/entity";
import { EntityType } from "@/lib/contracts";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function buildLeaderboard() {
  const [rssItems, proposals] = await Promise.all([
    withTimeout(fetchAllFeeds(), 25000, []),
    withTimeout(fetchAllProposals(), 25000, []),
  ]);

  const sourceMap = new Map<
    string,
    {
      domain: string;
      articleCount: number;
      totalEngagement: number;
      biasRating: string | null;
      factuality: string | null;
      categories: Set<string>;
    }
  >();

  for (const item of rssItems) {
    const domain = item.source;
    const existing = sourceMap.get(domain) || {
      domain,
      articleCount: 0,
      totalEngagement: 0,
      biasRating: null,
      factuality: null,
      categories: new Set<string>(),
    };
    existing.articleCount++;
    existing.categories.add(item.category);
    if (item.bias) {
      existing.biasRating = item.bias.bias;
      existing.factuality = item.bias.factuality;
    }
    sourceMap.set(domain, existing);
  }

  const daoMap = new Map<
    string,
    { name: string; proposalCount: number; activeCount: number; totalVotes: number; logo: string }
  >();

  for (const p of proposals) {
    const name = p.dao;
    const existing = daoMap.get(name) || {
      name,
      proposalCount: 0,
      activeCount: 0,
      totalVotes: 0,
      logo: p.daoLogo,
    };
    existing.proposalCount++;
    if (p.status === "active") existing.activeCount++;
    existing.totalVotes += p.votesFor + p.votesAgainst;
    daoMap.set(name, existing);
  }

  const entries = [];
  let rank = 1;

  const factScores: Record<string, number> = {
    "very-high": 95,
    high: 85,
    "mostly-factual": 70,
    mixed: 50,
    low: 30,
    "very-low": 15,
  };

  const sortedSources = [...sourceMap.values()].sort(
    (a, b) => b.articleCount - a.articleCount
  );

  for (const src of sortedSources) {
    const factScore = src.factuality ? factScores[src.factuality] || 60 : 60;
    const volumeScore = Math.min(100, src.articleCount * 5);
    const composite = factScore * 0.5 + volumeScore * 0.3 + 60 * 0.2;

    entries.push({
      rank: rank++,
      entityHash: computeEntityHash(src.domain),
      identifier: src.domain,
      entityType: EntityType.DOMAIN,
      avgRating: factScore / 20,
      ratingCount: src.articleCount,
      tipTotal: "0 ETH",
      commentCount: 0,
      aiScore: factScore,
      compositeScore: Math.round(composite * 10) / 10,
      categories: [...src.categories],
      biasRating: src.biasRating,
      factuality: src.factuality,
    });
  }

  const sortedDaos = [...daoMap.values()].sort(
    (a, b) => b.proposalCount - a.proposalCount
  );

  for (const dao of sortedDaos) {
    const activityScore = Math.min(100, dao.proposalCount * 3 + dao.activeCount * 20);
    const voteScore = Math.min(100, Math.log10(dao.totalVotes + 1) * 25);
    const composite = activityScore * 0.4 + voteScore * 0.4 + 50 * 0.2;

    entries.push({
      rank: rank++,
      entityHash: computeEntityHash(dao.name),
      identifier: dao.name,
      entityType: EntityType.CONTRACT,
      avgRating: Math.min(5, composite / 20),
      ratingCount: dao.proposalCount,
      tipTotal: "0 ETH",
      commentCount: dao.totalVotes,
      aiScore: Math.round(activityScore),
      compositeScore: Math.round(composite * 10) / 10,
      logo: dao.logo,
    });
  }

  entries.sort((a, b) => b.compositeScore - a.compositeScore);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

export async function AsyncLeaderboardTable() {
  const entries = await buildLeaderboard();
  return <LeaderboardTable entries={entries} />;
}
