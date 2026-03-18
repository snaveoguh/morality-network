import { getAggregatedMarketSignals } from "@/lib/trading/signals";
import { SignalDashboard } from "@/components/trading/SignalDashboard";

export const revalidate = 60; // 1 min ISR

export default async function SignalsPage() {
  const signals = await getAggregatedMarketSignals({
    limit: 250,
    minAbsScore: 0.1,
  });

  const totalObservations = signals.reduce((sum, s) => sum + s.observations, 0);

  return (
    <div>
      {/* Page header — newspaper style */}
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Trading Signals
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Directional market signals aggregated from AI-generated editorial
          analysis — weighted by recency, conviction, and significance across{" "}
          {totalObservations} observations
        </p>
      </div>

      {/* Methodology */}
      <div className="mb-6 border border-[var(--rule-light)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span className="font-bold text-[var(--ink)]">Signal Score</span> ={" "}
          Direction &times; Confidence &times; Significance &times; Recency
          Decay (48h) &times; Time Horizon Weight
        </p>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Conflicting signals trigger contradiction penalty dampening.
          Bullish signals open long, bearish signals open short.
        </p>
      </div>

      <SignalDashboard signals={signals} />
    </div>
  );
}
