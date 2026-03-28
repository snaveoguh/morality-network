import { withBrand, BRAND_NAME } from "@/lib/brand";

export const metadata = {
  title: withBrand("Polymarket Arbitrage"),
  description: "Live Polymarket arbitrage opportunities detected by Polypooter — risk-free spreads across binary and multi-outcome prediction markets.",
};

export const revalidate = 120; // 2 min ISR

/* ── Types ── */

interface ArbMarketLeg {
  marketId: string;
  question: string;
  tokenId: string;
  side: "YES" | "NO";
  bestAsk: number;
  availableSize: number;
}

interface ArbOpportunity {
  id: string;
  strategy: "completeness" | "multi-outcome" | "stale-odds";
  eventTitle: string;
  markets: ArbMarketLeg[];
  totalCost: number;
  guaranteedReturn: number;
  spreadPct: number;
  netProfitPct: number;
  estimatedFeePct: number;
  liquidity: number;
  detectedAt: number;
}

interface ArbResponse {
  count: number;
  lastScanAt: string | null;
  opportunities: ArbOpportunity[];
}

interface ReportResponse {
  totalScans: number;
  totalOpportunitiesFound: number;
  lastScanAt: number | null;
  currentOpportunities: number;
  topOpportunities: ArbOpportunity[];
  summary: string;
}

/* ── Data fetch ── */

const API_BASE = process.env.POLYPOOTER_URL ?? "";

async function fetchOpportunities(): Promise<ArbResponse | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE.replace(/\/+$/, "")}/opportunities`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ArbResponse;
  } catch {
    return null;
  }
}

async function fetchReport(): Promise<ReportResponse | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE.replace(/\/+$/, "")}/report`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReportResponse;
  } catch {
    return null;
  }
}

/* ── Helpers ── */

function strategyLabel(strategy: string): string {
  switch (strategy) {
    case "completeness": return "Binary";
    case "multi-outcome": return "Multi";
    case "stale-odds": return "Stale";
    default: return strategy;
  }
}

function formatPct(pct: number): string {
  return `${(pct * 100).toFixed(2)}%`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Page ── */

export default async function PolymarketArbPage() {
  const [data, report] = await Promise.all([
    fetchOpportunities(),
    fetchReport(),
  ]);

  const opportunities = data?.opportunities ?? [];
  const lastScan = data?.lastScanAt ? new Date(data.lastScanAt) : null;
  const totalScans = report?.totalScans ?? 0;
  const totalFound = report?.totalOpportunitiesFound ?? 0;
  const bestSpread = opportunities.length > 0
    ? Math.max(...opportunities.map((o) => o.netProfitPct))
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-8 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-masthead text-3xl text-[var(--ink)] sm:text-4xl">
          Polymarket Arbitrage Scanner
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          Risk-free prediction market spreads detected by Polypooter &mdash; buying all
          outcomes for less than the guaranteed $1.00 payout.
        </p>
        <div className="mt-2 flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <span>Polymarket CLOB</span>
          <span>&middot;</span>
          <span>Binary + Multi-Outcome</span>
          <span>&middot;</span>
          <span>2% Resolution Fee</span>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="mb-8 border border-[var(--rule)] bg-[var(--paper-dark)] p-4">
        <div className="mb-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Scanner Status
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <div className="font-headline text-lg text-[var(--ink)]">{opportunities.length}</div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Live Opportunities
            </div>
          </div>
          <div>
            <div className="font-headline text-lg text-[var(--ink)]">
              {bestSpread > 0 ? formatPct(bestSpread) : "—"}
            </div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Best Spread
            </div>
          </div>
          <div>
            <div className="font-headline text-lg text-[var(--ink)]">{totalScans}</div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Total Scans
            </div>
          </div>
          <div>
            <div className="font-headline text-lg text-[var(--ink)]">
              {lastScan ? timeAgo(lastScan.getTime()) : "—"}
            </div>
            <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
              Last Scan
            </div>
          </div>
        </div>
      </div>

      {/* Opportunities Table */}
      {!data ? (
        <div className="border border-[var(--rule-light)] p-8 text-center">
          <p className="font-mono text-xs text-[var(--ink-faint)]">
            Polypooter service not connected. Configure POLYPOOTER_URL to enable.
          </p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="border border-[var(--rule-light)] p-8 text-center">
          <p className="font-body-serif text-sm text-[var(--ink-light)]">
            No arbitrage opportunities detected in the current scan.
          </p>
          <p className="mt-2 font-mono text-[9px] text-[var(--ink-faint)]">
            Markets are scanned every 5 minutes. Opportunities are fleeting — spreads
            close quickly once detected.
          </p>
        </div>
      ) : (
        <div className="border border-[var(--rule-light)]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[var(--rule)] bg-[var(--paper-dark)] px-3 py-2">
            <span className="w-[45%] font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
              Event
            </span>
            <span className="w-[10%] text-center font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
              Type
            </span>
            <span className="w-[12%] text-right font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
              Cost
            </span>
            <span className="w-[12%] text-right font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
              Spread
            </span>
            <span className="w-[12%] text-right font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-green-700">
              Net Profit
            </span>
            <span className="w-[9%] text-right font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--ink)]">
              Liq.
            </span>
          </div>

          {/* Rows */}
          {opportunities.map((opp, i) => (
            <div
              key={opp.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                i > 0 ? "border-t border-[var(--rule-light)]" : ""
              }`}
            >
              {/* Event title + legs */}
              <div className="w-[45%] min-w-0">
                <div className="truncate font-mono text-[10px] font-bold text-[var(--ink)]">
                  {opp.eventTitle}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {opp.markets.map((leg) => (
                    <span
                      key={leg.tokenId}
                      className="inline-block border border-[var(--rule-light)] px-1 py-0.5 font-mono text-[7px] text-[var(--ink-faint)]"
                    >
                      {leg.side} @ ${leg.bestAsk.toFixed(3)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Strategy type */}
              <div className="w-[10%] text-center">
                <span className={`inline-block border px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wider ${
                  opp.strategy === "completeness"
                    ? "border-[var(--ink)] text-[var(--ink)]"
                    : "border-amber-600 text-amber-600"
                }`}>
                  {strategyLabel(opp.strategy)}
                </span>
              </div>

              {/* Cost */}
              <div className="w-[12%] text-right font-mono text-[10px] text-[var(--ink)]">
                ${opp.totalCost.toFixed(4)}
              </div>

              {/* Spread */}
              <div className="w-[12%] text-right font-mono text-[10px] text-[var(--ink-light)]">
                {formatPct(opp.spreadPct)}
              </div>

              {/* Net Profit */}
              <div className="w-[12%] text-right font-mono text-[10px] font-bold text-green-700">
                {formatPct(opp.netProfitPct)}
              </div>

              {/* Liquidity */}
              <div className="w-[9%] text-right font-mono text-[9px] text-[var(--ink-faint)]">
                ${opp.liquidity >= 1000 ? `${(opp.liquidity / 1000).toFixed(0)}k` : opp.liquidity.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 border border-[var(--rule-light)] p-4">
        <div className="mb-2 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          How It Works
        </div>
        <div className="space-y-2 font-mono text-[9px] text-[var(--ink-faint)]">
          <p>
            <strong className="text-[var(--ink)]">Binary Arb:</strong> In a YES/NO market,
            outcomes are mutually exclusive. If bestAsk(YES) + bestAsk(NO) &lt; $1.00,
            buying both guarantees profit at resolution. After 2% resolution fee, any
            remaining spread is risk-free.
          </p>
          <p>
            <strong className="text-[var(--ink)]">Multi-Outcome Arb:</strong> Events with 3+
            outcomes (e.g., &ldquo;Who wins?&rdquo;). If the sum of cheapest YES prices across all
            outcomes &lt; $1.00, buying all YES tokens guarantees exactly one pays out.
          </p>
          <p>
            <strong className="text-[var(--ink)]">Scanner:</strong> Polypooter scans every 5
            minutes. Opportunities are ephemeral — spreads close quickly as market makers
            rebalance. This page shows the latest snapshot.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 border-t border-[var(--rule-light)] pt-3 text-center">
        <p className="font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Polypooter v0.1.0 &bull; {BRAND_NAME} &bull; scanning polymarket every 5 min
        </p>
      </footer>
    </div>
  );
}
