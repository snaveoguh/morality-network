import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { computeEntityHash, entityTypeLabel } from "@/lib/entity";
import { EntityType } from "@/lib/contracts";

export interface UniversalLedgerEntry {
  rank: number;
  entityHash: `0x${string}`;
  identifier: string;
  entityType: EntityType;
  avgRating: number;
  ratingCount: number;
  tipTotal: string;
  commentCount: number;
  aiScore: number;
  compositeScore: number;
  logo?: string;
  biasRating?: string | null;
  factuality?: string | null;
  categories?: string[];
}

export interface UniversalLedgerContext {
  hash: `0x${string}`;
  url?: string;
  title: string;
  source: string;
  type: string;
  description?: string;
  savedAt: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function buildUniversalLedger(): Promise<UniversalLedgerEntry[]> {
  const [rssItems, proposals] = await Promise.all([
    withTimeout(fetchAllFeeds(), 25_000, []),
    withTimeout(fetchAllProposals(), 25_000, []),
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

  for (const proposal of proposals) {
    const name = proposal.dao;
    const existing = daoMap.get(name) || {
      name,
      proposalCount: 0,
      activeCount: 0,
      totalVotes: 0,
      logo: proposal.daoLogo,
    };

    existing.proposalCount++;
    if (proposal.status === "active") existing.activeCount++;
    existing.totalVotes += proposal.votesFor + proposal.votesAgainst;
    daoMap.set(name, existing);
  }

  const entries: UniversalLedgerEntry[] = [];
  let rank = 1;

  const factScores: Record<string, number> = {
    "very-high": 95,
    high: 85,
    "mostly-factual": 70,
    mixed: 50,
    low: 30,
    "very-low": 15,
  };

  const sortedSources = [...sourceMap.values()].sort((a, b) => b.articleCount - a.articleCount);

  for (const source of sortedSources) {
    const factScore = source.factuality ? factScores[source.factuality] || 60 : 60;
    const volumeScore = Math.min(100, source.articleCount * 5);
    const composite = factScore * 0.5 + volumeScore * 0.3 + 60 * 0.2;

    entries.push({
      rank: rank++,
      entityHash: computeEntityHash(source.domain),
      identifier: source.domain,
      entityType: EntityType.DOMAIN,
      avgRating: factScore / 20,
      ratingCount: source.articleCount,
      tipTotal: "0 ETH",
      commentCount: 0,
      aiScore: factScore,
      compositeScore: Math.round(composite * 10) / 10,
      categories: [...source.categories],
      biasRating: source.biasRating,
      factuality: source.factuality,
    });
  }

  const sortedDaos = [...daoMap.values()].sort((a, b) => b.proposalCount - a.proposalCount);

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
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return entries;
}

export function buildUniversalLedgerContext(entry: UniversalLedgerEntry): UniversalLedgerContext {
  const descriptionParts = [
    entry.categories?.length ? entry.categories.slice(0, 3).join(", ") : null,
    entry.biasRating ? `bias: ${entry.biasRating}` : null,
    entry.factuality ? `factuality: ${entry.factuality}` : null,
  ].filter(Boolean);

  return {
    hash: entry.entityHash,
    title: entry.identifier,
    source: "Universal Ledger",
    type: entityTypeLabel(entry.entityType).toLowerCase(),
    description: descriptionParts.length > 0 ? descriptionParts.join(" · ") : undefined,
    savedAt: new Date().toISOString(),
  };
}

export async function findUniversalLedgerContext(
  entityHash: `0x${string}`,
): Promise<UniversalLedgerContext | null> {
  const entries = await buildUniversalLedger();
  const match = entries.find(
    (entry) => entry.entityHash.toLowerCase() === entityHash.toLowerCase(),
  );

  return match ? buildUniversalLedgerContext(match) : null;
}
