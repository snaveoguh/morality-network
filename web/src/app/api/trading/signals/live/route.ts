import { NextResponse } from "next/server";
import { requireMoHolderAccess } from "@/lib/holder-access";
import { reportWarn } from "@/lib/report-error";
import { getTraderConfig } from "@/lib/trading/config";
import { fetchTechnicalSignal } from "@/lib/trading/technical";
import { detectPatterns } from "@/lib/trading/pattern-detector";
import { computeCompositeSignal } from "@/lib/trading/composite-signal";
import { getAggregatedMarketSignals } from "@/lib/trading/signals";

export async function GET(request: Request) {
  try {
    const access = await requireMoHolderAccess(request);
    if (access instanceof NextResponse) {
      return access;
    }

    const config = getTraderConfig();
    const watchMarkets = config.hyperliquid.watchMarkets;

    // Fetch news signals once
    let newsSignals: Awaited<ReturnType<typeof getAggregatedMarketSignals>> = [];
    try {
      newsSignals = await getAggregatedMarketSignals({ limit: 250, minAbsScore: 0.2 });
    } catch (e) { reportWarn("api:signals-live:news", e); }

    // Compute signals for all watched markets in parallel
    const results = await Promise.all(
      watchMarkets.map(async (symbol) => {
        try {
          const technical = await fetchTechnicalSignal(config, symbol);
          const pattern = await detectPatterns(config, symbol, technical);
          const newsForSymbol = newsSignals.find(
            (s) => s.symbol.toUpperCase() === symbol.toUpperCase(),
          ) ?? null;

          const composite = computeCompositeSignal({
            symbol,
            technical,
            pattern,
            newsSignal: newsForSymbol,
            minConfidence: config.risk.minSignalConfidence,
          });

          return {
            symbol,
            direction: composite.direction,
            confidence: composite.confidence,
            agreementMet: composite.agreementMet,
            components: {
              technical: composite.components.technical
                ? { direction: composite.components.technical.direction, strength: composite.components.technical.strength }
                : null,
              pattern: composite.components.pattern
                ? { direction: composite.components.pattern.direction, patterns: composite.components.pattern.patterns }
                : null,
              news: composite.components.news
                ? { direction: composite.components.news.direction, score: composite.components.news.score }
                : null,
            },
            reasons: composite.reasons,
          };
        } catch (error) {
          return {
            symbol,
            direction: "neutral" as const,
            confidence: 0,
            agreementMet: false,
            components: { technical: null, pattern: null, news: null },
            reasons: [`Error: ${error instanceof Error ? error.message : "unknown"}`],
          };
        }
      }),
    );

    return NextResponse.json(
      {
        timestamp: Date.now(),
        markets: results,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute live signals" },
      { status: 500 },
    );
  }
}
