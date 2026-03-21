import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { buildAnalystReputationFromPredictionMarkets } from "@/lib/analyst-reputation";
import { buildInterpretationOutcomeScores } from "@/lib/interpretation-scores";
import { buildUniversalLedger } from "@/lib/universal-ledger";

export const dynamic = "force-dynamic"; // too heavy for build-time prerender
export const maxDuration = 55;

export default async function LeaderboardPage() {
  const [entries, analystSnapshot, interpretationSnapshot] = await Promise.all([
    buildUniversalLedger(),
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
