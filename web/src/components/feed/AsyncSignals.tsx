import Link from "next/link";
import { getAggregatedMarketSignals, type AggregatedMarketSignal } from "@/lib/trading/signals";

// ============================================================================
// SIGNALS BAND — the Bearometer on the front page, straight under the lead.
//
// Long-run direction per asset, aggregated from every news report the
// swarm and the newsroom have scored (recency-weighted, penalised when
// reports disagree). One ink colour: the bar grows left for bearish, right
// for bullish from a centre rule. Data, not advice.
//
// phone: order 2, under the lead          ≥1024: 9 cols, row 3 beside the ledger
// ============================================================================

const SHOWN = 8;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function SignalsFrame({ meta, children }: { meta: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section
      aria-label="Bearometer"
      className="order-2 mt-6 border-t border-[var(--rule-light)] pt-5 lg:col-span-9 lg:row-start-3 lg:mt-0 lg:pt-6 lg:pr-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link href="/signals" className="text-[15px] font-bold text-[var(--ink)]">
          Bearometer ›
        </Link>
        <span className="text-xs text-[var(--ink-faint)]">Signals and data, not financial advice</span>
      </div>
      <p className="mb-3 mt-1 text-[13px] text-[var(--ink-faint)]">{meta}</p>
      {children}
    </section>
  );
}

export function SignalsSkeleton() {
  return (
    <SignalsFrame meta={<span className="inline-block h-3 w-56 animate-pulse bg-[var(--rule-light)]" />}>
      <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-5 animate-pulse bg-[var(--rule-light)]" />
        ))}
      </div>
    </SignalsFrame>
  );
}

function SignalRow({ s }: { s: AggregatedMarketSignal }) {
  const strength = Math.max(0.04, Math.min(1, Math.abs(s.score)));
  const bull = s.direction === "bullish";
  return (
    <Link
      href={`/signals#${encodeURIComponent(s.symbol)}`}
      className="group grid grid-cols-[64px_1fr_92px] items-center gap-3 text-[13px] text-[var(--ink)]"
    >
      <span className="truncate font-bold group-hover:underline group-hover:underline-offset-4">{s.symbol}</span>
      <span className="relative h-4" aria-hidden>
        <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--rule)]" />
        <span
          className="absolute inset-y-0.5 bg-[var(--ink)]"
          style={bull ? { left: "50%", width: `${strength * 50}%` } : { right: "50%", width: `${strength * 50}%` }}
        />
      </span>
      <span className="text-right text-[var(--ink-light)]">
        {bull ? "Bullish" : "Bearish"} &middot; {s.observations}
      </span>
    </Link>
  );
}

export async function AsyncSignals() {
  const signals = await withTimeout(
    getAggregatedMarketSignals({ limit: 60, minAbsScore: 0.1 }).catch(() => [] as AggregatedMarketSignal[]),
    6000,
    [] as AggregatedMarketSignal[],
  );

  if (signals.length === 0) {
    return (
      <SignalsFrame meta="Long-run buy and sell signals, read from the news we crawl. No signals are scored right now." />
    );
  }

  const top = [...signals].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, SHOWN);
  const reports = signals.reduce((sum, s) => sum + s.observations, 0);

  return (
    <SignalsFrame
      meta={`Strongest of ${signals.length} assets, from ${reports.toLocaleString("en-GB")} scored news reports, weighted by recency and agreement. Number = reports.`}
    >
      <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
        {top.map((s) => (
          <SignalRow key={s.symbol} s={s} />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-[var(--ink-faint)] md:hidden">
        <span>← bearish</span>
        <span>bullish →</span>
      </div>
      <Link
        href="/signals"
        className="mt-4 inline-flex min-h-11 items-center text-[13px] font-semibold text-[var(--ink)] underline decoration-[var(--ink-faint)] underline-offset-4"
      >
        All signals and China supply-chain pressure ›
      </Link>
    </SignalsFrame>
  );
}
