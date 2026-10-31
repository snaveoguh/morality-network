import { NextResponse } from "next/server";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { selectPoliticsSlidesCached } from "@/lib/politics-slider";

// Home page politics slider: UK politics, or global politics relevant to the
// UK, with an image (lib/politics-slider.ts). The client polls this every
// few minutes and swaps in new slides. The feed is cached in rss.ts and the
// selection per feed refresh, so a request is one cached read.
export async function GET() {
  try {
    const items = await fetchAllFeeds(DEFAULT_FEEDS);
    const slides = selectPoliticsSlidesCached(items);
    return NextResponse.json(
      { slides, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ slides: [], generatedAt: new Date().toISOString() }, { status: 200 });
  }
}
