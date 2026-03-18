import { fetchActivePredictionProposals } from "@/lib/governance";
import { MarketCard } from "@/components/predictions/MarketCard";

export async function AsyncMarketGrid() {
  let proposals: Awaited<ReturnType<typeof fetchActivePredictionProposals>> = [];
  try {
    proposals = await fetchActivePredictionProposals();
  } catch (error) {
    console.error("[Predictions] Failed to fetch proposals:", error);
  }

  if (proposals.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
          No active Nouns or Lil Nouns proposals at the moment. Check back
          when a new proposal goes to vote.
        </p>
      </div>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
        Active Markets ({proposals.length})
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {proposals.map((p) => (
          <MarketCard
            key={`${p.dao}-${p.id}`}
            dao={p.dao}
            proposalId={p.proposalNumber?.toString() ?? p.id}
            title={p.title}
            status={p.status}
            url={p.link}
            votesFor={p.votesFor}
            votesAgainst={p.votesAgainst}
            quorum={p.quorum}
          />
        ))}
      </div>
    </section>
  );
}
