import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { computeEntityHash, entityTypeLabel } from "@/lib/entity";
import { EntityType } from "@/lib/contracts";

// The registry lists what pooter world actually tracks: the news sources in
// the feed (with their published bias/factuality ratings) and the DAOs whose
// proposals we follow. Every figure is a count from the live crawl. No
// synthetic "ratings" or composite scores: onchain ratings show on each
// entity page once people leave them.
export interface UniversalLedgerEntry {
  rank: number;
  entityHash: `0x${string}`;
  identifier: string;
  entityType: EntityType;
  /** Articles in the current feed (sources) or proposals tracked (DAOs). */
  itemCount: number;
  /** Proposals currently open for voting (DAOs only). */
  activeCount?: number;
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
    { name: string; proposalCount: number; activeCount: number; logo: string }
  >();

  for (const proposal of proposals) {
    const name = proposal.dao;
    const existing = daoMap.get(name) || {
      name,
      proposalCount: 0,
      activeCount: 0,
      logo: proposal.daoLogo,
    };

    existing.proposalCount++;
    if (proposal.status === "active") existing.activeCount++;
    daoMap.set(name, existing);
  }

  const factualityOrder: Record<string, number> = {
    "very-high": 0,
    high: 1,
    "mostly-factual": 2,
    mixed: 3,
    low: 4,
    "very-low": 5,
  };
  const rankOf = (f: string | null) => (f ? factualityOrder[f] ?? 6 : 6);

  const sources: UniversalLedgerEntry[] = [...sourceMap.values()]
    .sort(
      (a, b) =>
        rankOf(a.factuality) - rankOf(b.factuality) ||
        b.articleCount - a.articleCount ||
        a.domain.localeCompare(b.domain),
    )
    .map((source) => ({
      rank: 0,
      entityHash: computeEntityHash(source.domain),
      identifier: source.domain,
      entityType: EntityType.DOMAIN,
      itemCount: source.articleCount,
      categories: [...source.categories],
      biasRating: source.biasRating,
      factuality: source.factuality,
    }));

  const daos: UniversalLedgerEntry[] = [...daoMap.values()]
    .sort((a, b) => b.activeCount - a.activeCount || b.proposalCount - a.proposalCount)
    .map((dao) => ({
      rank: 0,
      entityHash: computeEntityHash(dao.name),
      identifier: dao.name,
      entityType: EntityType.CONTRACT,
      itemCount: dao.proposalCount,
      activeCount: dao.activeCount,
      logo: dao.logo,
    }));

  const entries = [...sources, ...daos];
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
