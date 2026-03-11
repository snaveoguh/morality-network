import { NextResponse } from "next/server";
import { fetchAllFeeds, DEFAULT_FEEDS } from "@/lib/rss";
import { fetchAllProposals } from "@/lib/governance";
import type { Proposal } from "@/lib/governance";

// Reuse cached feeds from the feed endpoint pattern
let cachedItems: Awaited<ReturnType<typeof fetchAllFeeds>> | null = null;
let cachedGov: Proposal[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const now = Date.now();
  if (!cachedItems || now - cacheTime > CACHE_DURATION) {
    const [feeds, gov] = await Promise.allSettled([
      fetchAllFeeds(DEFAULT_FEEDS),
      fetchAllProposals(),
    ]);
    cachedItems = feeds.status === "fulfilled" ? feeds.value : [];
    cachedGov = gov.status === "fulfilled" ? gov.value : [];
    cacheTime = now;
  }

  const terms = q.split(/\s+/).filter(Boolean);

  // Search RSS items
  const rssResults = (cachedItems || [])
    .filter((item) => {
      const haystack = `${item.title} ${item.source} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.category}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 20)
    .map((item) => ({
      type: "rss" as const,
      title: item.title,
      source: item.source,
      category: item.category,
      link: item.link,
      pubDate: item.pubDate,
      imageUrl: item.imageUrl,
    }));

  // Search governance items
  const govResults = (cachedGov || [])
    .filter((p) => {
      const haystack = `${p.title} ${p.dao} ${(p.tags || []).join(" ")} ${p.source}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 10)
    .map((p) => ({
      type: "governance" as const,
      title: p.title,
      source: p.source,
      category: p.dao,
      link: p.link,
      id: p.id,
    }));

  const results = [...rssResults, ...govResults];

  return NextResponse.json({ results, total: results.length });
}
