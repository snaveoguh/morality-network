import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { fetchAllFeeds } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import { computeEntityHash } from "@/lib/entity";
import { EntityType } from "@/lib/contracts";
import { buildAnalystReputationFromPredictionMarkets } from "@/lib/analyst-reputation";
import { buildInterpretationOutcomeScores } from "@/lib/interpretation-scores";

export const dynamic = "force-dynamic"; // too heavy for build-time prerender
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Derive leaderboard from real feed + governance data
async function buildLeaderboard() {
  const [rssItems, proposals] = await Promise.all([
    withTimeout(fetchAllFeeds(), 25000, []),
    withTimeout(fetchAllProposals(), 25000, []),
  ]);

  // Aggregate by source domain
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

  // Aggregate DAOs from governance
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

  // Build entries for sources
  const entries = [];
  let rank = 1;

  // Score factuality
  const factScores: Record<string, number> = {
    "very-high": 95,
    high: 85,
    "mostly-factual": 70,
    mixed: 50,
    low: 30,
    "very-low": 15,
  };

  // Sort sources by article count (proxy for engagement)
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
      avgRating: factScore / 20, // normalize to 0-5
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

  // Add DAOs
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

  // Re-sort by composite and re-rank
  entries.sort((a, b) => b.compositeScore - a.compositeScore);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

export default async function LeaderboardPage() {
  const [entries, analystSnapshot, interpretationSnapshot] = await Promise.all([
    buildLeaderboard(),
    buildAnalystReputationFromPredictionMarkets({
      limit: 8,
      minPredictions: 2,
      lookbackBlocks: BigInt("90000"),
    }),
    buildInterpretationOutcomeScores({
      limit: 5,
      lookbackBlocks: BigInt("90000"),
      minOutcomeScore: -100,
      onlyCorrect: false,
    }),
  ]);
  const topAnalysts = analystSnapshot.analysts.slice(0, 5);
  const topInterpretations = interpretationSnapshot.interpretations.slice(0, 3);

  return (
    <div>
      {/* Page header — newspaper style */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          The Universal Ledger
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Reputation rankings for every source, domain, contract, and entity on the network
        </p>
      </div>

      {/* Scoring explanation */}
      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Composite Score</span> ={" "}
          Factuality (50%) + Volume (30%) + Community (20%)
        </p>
      </div>

      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Analyst Discovery
        </h2>
        <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {analystSnapshot.scoringUnit === "interpretation"
            ? `Interpretations scored: ${analystSnapshot.scoredInterpretations} · Ideas first`
            : `Resolved markets: ${analystSnapshot.resolvedMarkets} · Right over loud`}
        </p>

        {topAnalysts.length === 0 ? (
          <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
            No resolved analyst predictions yet.
          </p>
        ) : (
          <div className="space-y-2">
            {topAnalysts.map((analyst, index) => (
              <div
                key={analyst.address}
                className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-[var(--rule-light)] pb-2 last:border-0"
              >
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-[var(--ink)]">
                    {analyst.address}
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {analyst.correctPredictions}/{analyst.totalPredictions} correct · {analyst.totalStakedEth.toFixed(3)} ETH signaled
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-headline text-lg text-[var(--ink)]">
                    {analyst.credibilityScore.toFixed(1)}
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                    credibility
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Ideas That Aged Best
        </h2>
        <p className="mb-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          Interpretation → Outcome → Score
        </p>
        {topInterpretations.length === 0 ? (
          <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
            No scored interpretations yet.
          </p>
        ) : (
          <div className="space-y-3">
            {topInterpretations.map((row) => (
              <div
                key={row.id}
                className="border-b border-[var(--rule-light)] pb-3 last:border-0"
              >
                <p className="line-clamp-2 font-body-serif text-sm text-[var(--ink)]">
                  &ldquo;{row.interpretation}&rdquo;
                </p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {row.dao} #{row.proposalId} · predicted {row.predictedOutcome} · resolved{" "}
                  {row.resolvedOutcome}
                </p>
                <div className="mt-1 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider">
                  <span
                    className={
                      row.wasCorrect
                        ? "text-[var(--ink)]"
                        : "text-[var(--accent-red)]"
                    }
                  >
                    {row.wasCorrect ? "correct" : "incorrect"} ·{" "}
                    {row.hasEvidence ? "evidence" : "no evidence"}
                  </span>
                  <span className="text-[var(--ink-faint)]">
                    score {row.outcomeScore.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LeaderboardTable entries={entries} />
    </div>
  );
}
