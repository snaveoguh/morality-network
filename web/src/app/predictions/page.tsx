import { fetchActivePredictionProposals } from "@/lib/governance";
import { MarketCard } from "@/components/predictions/MarketCard";
import { withBrand } from "@/lib/brand";

export const revalidate = 60;

export const metadata = {
  title: withBrand("Nouns + Lil Nouns Predictions"),
  description:
    "Wager ETH on active Nouns and Lil Nouns proposal outcomes. Winners split the pot.",
};

export default async function PredictionsPage() {
  let proposals: Awaited<ReturnType<typeof fetchActivePredictionProposals>> = [];
  try {
    proposals = await fetchActivePredictionProposals();
  } catch (error) {
    console.error("[Predictions] Failed to fetch proposals:", error);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-2xl font-bold text-[var(--ink)]">
          Nouns + Lil Nouns Predictions
        </h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          Wager ETH on active Nouns and Lil Nouns proposal outcomes. Parimutuel
          system &mdash; winners split the pot.
        </p>
        <div className="mt-2 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Ethereum Mainnet prediction markets &bull; Base powers comments and registry
        </div>
      </div>

      {/* Active Nouns Proposals */}
      {proposals.length > 0 && (
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
      )}

      {/* Empty state */}
      {proposals.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
            No active Nouns or Lil Nouns proposals at the moment. Check back
            when a new proposal goes to vote.
          </p>
        </div>
      )}

      {/* How it works */}
      <section className="border-t-2 border-[var(--rule)] pt-6">
        <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          How It Works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Pick a Side",
              desc: "Choose PASS or FAIL on any active Nouns or Lil Nouns proposal.",
            },
            {
              step: "2",
              title: "Stake ETH",
              desc: "Your stake joins the pool. Higher odds = higher risk = higher reward.",
            },
            {
              step: "3",
              title: "Collect",
              desc: "When the vote resolves, winners split the losing side's pool proportionally.",
            },
          ].map((item) => (
            <div key={item.step} className="border border-[var(--rule-light)] p-3">
              <span className="font-mono text-2xl font-bold text-[var(--ink-faint)]">
                {item.step}
              </span>
              <h3 className="mt-1 font-headline text-sm font-bold text-[var(--ink)]">
                {item.title}
              </h3>
              <p className="mt-1 font-body-serif text-[11px] text-[var(--ink-light)]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
