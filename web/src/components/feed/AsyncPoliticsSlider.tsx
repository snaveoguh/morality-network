import "server-only";

import { fetchAllFeeds, type FeedItem } from "@/lib/rss";
import { selectPoliticsSlidesCached } from "@/lib/politics-slider";
import { PoliticsSlider, SliderSkeleton } from "./PoliticsSlider";

// Server half of the home page politics slider: renders the first slides
// into the HTML, then PoliticsSlider polls /api/front/slider for new ones.
// The feed is shared with AsyncFeed through the rss.ts cache. With fewer
// than three qualifying stories the client renders nothing until a poll
// brings enough in.

const FEED_TIMEOUT_MS = 12_000; // same budget as AsyncFeed, which shares the crawl

export async function AsyncPoliticsSlider() {
  const items = await Promise.race([
    fetchAllFeeds().catch(() => [] as FeedItem[]),
    new Promise<FeedItem[]>((resolve) => setTimeout(() => resolve([]), FEED_TIMEOUT_MS)),
  ]);
  const slides = selectPoliticsSlidesCached(items);
  return <PoliticsSlider initialSlides={slides} generatedAt={new Date().toISOString()} />;
}

/** Same footprint as the slider, so the record band does not jump. */
export function PoliticsSliderSkeleton() {
  return <SliderSkeleton />;
}
