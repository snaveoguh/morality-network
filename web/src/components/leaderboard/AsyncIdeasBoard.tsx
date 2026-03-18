import { buildInterpretationOutcomeScores } from "@/lib/interpretation-scores";

export async function AsyncIdeasBoard() {
  const interpretationSnapshot = await buildInterpretationOutcomeScores({
    limit: 5,
    lookbackBlocks: BigInt("90000"),
    minOutcomeScore: -100,
    onlyCorrect: false,
  });
  const topInterpretations = interpretationSnapshot.interpretations.slice(0, 3);

  return (
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
  );
}
