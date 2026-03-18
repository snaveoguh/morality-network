import { SignalsSkeleton } from "@/components/trading/SignalsSkeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Trading Signals
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          Directional market signals aggregated from AI-generated editorial
          analysis — weighted by recency, conviction, and significance
        </p>
      </div>
      <SignalsSkeleton />
    </div>
  );
}
