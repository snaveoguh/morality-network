import { AgentMarketDashboard } from "@/components/markets/AgentMarketDashboard";
import { LiquidationMap } from "@/components/markets/LiquidationMap";
import { HyperstructurePanel } from "@/components/markets/HyperstructurePanel";
import { NarrativeGrid } from "@/components/markets/NarrativeGrid";
import { getLiveNarratives } from "@/lib/narratives";
import { withBrand } from "@/lib/brand";
import { getLiquidationMaps } from "@/lib/liquidation-map-data";

export const revalidate = 300; // 5 min — live narratives from swarm
export const metadata = {
  title: withBrand("Agent Markets"),
  description:
    "Macro narratives, estimated liquidation levels, market sentiment, and live agent trading telemetry.",
};

export default async function MarketsPage() {
  const [narratives, liquidationMaps] = await Promise.all([
    getLiveNarratives(),
    getLiquidationMaps(),
  ]);

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

      {/* Liquidation map — estimated from Hyperliquid open interest */}
      <LiquidationMap snapshot={liquidationMaps} />

      {/* Hyperstructure flywheel — agent profit vs inference burn */}
      <HyperstructurePanel />

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
