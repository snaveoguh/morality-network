import { NextResponse } from "next/server";
import { getGlobalSupplySnapshot } from "@/lib/bearometer/global-supply";
import { DATA_INDICATORS, NEWS_INDICATORS } from "@/lib/bearometer/global-supply-taxonomy";
import { GLOBAL_NEWS_SOURCES } from "@/lib/bearometer/global-supply-sources";

// Bearometer global supply-chain readings by region. Signals and data, not advice.
// ?sources=1 lists every indicator and feed instead.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("sources") === "1") {
    return NextResponse.json({
      data: DATA_INDICATORS,
      news: NEWS_INDICATORS.map((def) => ({ ...def, patterns: undefined })),
      feeds: GLOBAL_NEWS_SOURCES,
    });
  }

  const snapshot = await getGlobalSupplySnapshot();
  return NextResponse.json(
    {
      generatedAt: snapshot.generatedAt,
      regions: snapshot.regions.map((region) => ({
        ...region,
        news: region.news.map((reading) => ({ ...reading, def: { ...reading.def, patterns: undefined } })),
      })),
      china: {
        ...snapshot.china,
        indicators: snapshot.china.indicators.map((indicator) => ({
          ...indicator,
          group: { ...indicator.group, patterns: undefined },
        })),
      },
      dataSourcesFailed: snapshot.dataSourcesFailed,
      newsSourcesEmpty: snapshot.newsSourcesEmpty,
      disclaimer: "Signals and data only. Not financial advice or a recommendation to trade.",
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } },
  );
}
