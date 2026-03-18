import { buildAnalystReputationFromPredictionMarkets } from "@/lib/analyst-reputation";

export async function AsyncAnalystDiscovery() {
  const analystSnapshot = await buildAnalystReputationFromPredictionMarkets({
    limit: 8,
    minPredictions: 2,
    lookbackBlocks: BigInt("90000"),
  });
  const topAnalysts = analystSnapshot.analysts.slice(0, 5);

  return (
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
  );
}
