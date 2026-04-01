import { AgentMarketDashboard } from "@/components/markets/AgentMarketDashboard";
import { NarrativeGrid } from "@/components/markets/NarrativeGrid";
import { getSeedNarratives } from "@/lib/narratives";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Agent Markets"),
  description:
    "Macro narratives, market sentiment, and live agent trading telemetry.",
};

export default function MarketsPage() {
  const narratives = getSeedNarratives();

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      {/* Macro Narratives */}
      <div className="mb-8">
        <div className="mb-4 border-b-2 border-[var(--rule)] pb-3">
          <h2 className="font-headline text-2xl text-[var(--ink)]">
            Macro Narratives
          </h2>
          <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
            The thematic forces shaping markets. Rate them, challenge them,
            discuss them onchain.
          </p>
        </div>
        <NarrativeGrid narratives={narratives} />
      </div>

      {/* Agent Trading Dashboard */}
      <div className="mb-4 border-b-2 border-[var(--rule)] pb-3">
        <h2 className="font-headline text-2xl text-[var(--ink)]">
          Agent Trading
        </h2>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Live agent trading telemetry, PnL, balances, and public funding flow.
        </p>
      </div>
      <AgentMarketDashboard />
    </main>
  );
}
